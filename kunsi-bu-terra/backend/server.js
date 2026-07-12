// ============================================================================
// Kunsi bu Terra — backend
// Duas responsabilidades:
//   1. /api/submit-score   — recebe pontuações do jogo, valida-as e só depois
//                             escreve no leaderboard (o browser deixa de
//                             escrever direto no Supabase).
//   2. /api/push/*         — guarda subscrições push e envia o lembrete
//                             diário de streak (chamado por um Cron Job).
//
// Deploy: Render > New > Web Service, root deste repositório = pasta "backend".
// Build command: npm install       Start command: npm start
// ============================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_CONTACT_EMAIL,
  CRON_SECRET,
  ALLOWED_ORIGIN,
  PORT
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (VAPID_CONTACT_EMAIL || 'contacto@example.com'),
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(cors({ origin: ALLOWED_ORIGIN || '*' }));

// ----------------------------------------------------------------------------
// Anti-fraude: limites de bom senso. Ajusta estes números à medida que
// perceberes o comportamento real dos jogadores — o objetivo não é ser
// perfeito (um quiz 100% client-side nunca vai ser inviolável), é impedir
// que alguém consiga inflacionar o número com um clique/script trivial.
// ----------------------------------------------------------------------------
const MAX_XP_PER_SUBMISSION = 600;      // XP ganho plausível numa única sessão de jogo
const MAX_PLAYED_DELTA = 5;             // nº de partidas plausível entre duas sincronizações
const MIN_SECONDS_BETWEEN_SUBMISSIONS = 15; // anti-spam de pedidos

const recentByDevice = new Map(); // device_id -> timestamp (ms) da última submissão aceite nesta instância

function tooSoon(deviceId) {
  const last = recentByDevice.get(deviceId);
  if (!last) return false;
  return (Date.now() - last) < MIN_SECONDS_BETWEEN_SUBMISSIONS * 1000;
}

async function logSubmission(row) {
  try {
    await supabase.from('score_submissions').insert(row);
  } catch (e) {
    console.error('Falha ao registar submissão:', e.message);
  }
}

app.post('/api/submit-score', async (req, res) => {
  try {
    const { device_id, name, avatar, xp, level, totalCorrect, played, tournamentBest } = req.body || {};

    if (!device_id || typeof device_id !== 'string' || device_id.length > 100) {
      return res.status(400).json({ ok: false });
    }
    if (![xp, level, totalCorrect, played].every((n) => Number.isInteger(n) && n >= 0)) {
      return res.status(400).json({ ok: false });
    }

    if (tooSoon(device_id)) {
      await logSubmission({
        device_id, xp, xp_delta: 0, played, total_correct: totalCorrect,
        accepted: false, reject_reason: 'rate_limit'
      });
      return res.json({ ok: false });
    }

    const { data: existing } = await supabase
      .from('leaderboard')
      .select('xp, played')
      .eq('device_id', device_id)
      .maybeSingle();

    const prevXp = existing?.xp || 0;
    const prevPlayed = existing?.played || 0;
    const xpDelta = xp - prevXp;
    const playedDelta = played - prevPlayed;

    let rejectReason = null;
    if (xpDelta < 0) rejectReason = 'xp_diminuiu';
    else if (xpDelta > MAX_XP_PER_SUBMISSION) rejectReason = 'xp_delta_excessivo';
    else if (playedDelta < 0) rejectReason = 'played_diminuiu';
    else if (playedDelta > MAX_PLAYED_DELTA) rejectReason = 'played_delta_excessivo';

    await logSubmission({
      device_id, xp, xp_delta: xpDelta, played, total_correct: totalCorrect,
      accepted: !rejectReason, reject_reason: rejectReason
    });

    if (rejectReason) {
      // não revelamos o motivo exato ao cliente — evita ensinar como contornar os limites
      return res.json({ ok: false });
    }

    recentByDevice.set(device_id, Date.now());

    const safeName = String(name || 'Jogador').slice(0, 40);
    const safeAvatar = String(avatar || '🧑').slice(0, 8);

    await supabase.from('leaderboard').upsert({
      device_id,
      name: safeName,
      avatar: safeAvatar,
      xp,
      level,
      total_correct: totalCorrect,
      played,
      tournament_best: tournamentBest || 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'device_id' });

    // aproveita para marcar que este device jogou hoje (para o lembrete de streak)
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from('push_subscriptions')
      .update({ last_played_date: today })
      .eq('device_id', device_id);

    res.json({ ok: true });
  } catch (e) {
    console.error('Erro em /api/submit-score:', e.message);
    res.status(500).json({ ok: false });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const { data, error } = await supabase
    .from('leaderboard')
    .select('device_id, name, avatar, xp, level, played, tournament_best')
    .order('xp', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ ok: false });
  res.json(data);
});

// ----------------------------------------------------------------------------
// Push: subscrição
// ----------------------------------------------------------------------------
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { device_id, subscription, timezone } = req.body || {};
    if (!device_id || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ ok: false });
    }
    await supabase.from('push_subscriptions').upsert({
      device_id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      timezone: timezone || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'device_id' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Erro em /api/push/subscribe:', e.message);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/push/unsubscribe', async (req, res) => {
  const { device_id } = req.body || {};
  if (device_id) await supabase.from('push_subscriptions').delete().eq('device_id', device_id);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Push: envio do lembrete diário (chamado por um Cron Job do Render,
// 1x por dia, ex.: às 18:00 UTC). Protegido por um segredo simples.
// ----------------------------------------------------------------------------
app.get('/api/push/send-daily-reminders', async (req, res) => {
  if (!CRON_SECRET || req.query.secret !== CRON_SECRET) {
    return res.status(401).json({ ok: false });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ ok: false, error: 'VAPID não configurado' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('device_id, endpoint, p256dh, auth, last_played_date')
    .or(`last_played_date.is.null,last_played_date.lt.${today}`);

  if (error) return res.status(500).json({ ok: false });

  let sent = 0, removed = 0;
  for (const sub of subs || []) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };
    const payload = JSON.stringify({
      title: '🔥 Não percas a sequência!',
      body: 'Ainda não jogaste hoje. Responde a 5 perguntas rápidas e mantém a tua chama acesa no Kunsi bu Terra.',
      url: '/'
    });
    try {
      await webpush.sendNotification(pushSubscription, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('device_id', sub.device_id);
        removed++;
      } else {
        console.error('Falha ao enviar push para', sub.device_id, e.message);
      }
    }
  }
  res.json({ ok: true, sent, removed, total: (subs || []).length });
});

app.get('/', (_req, res) => res.json({ ok: true, service: 'kunsi-bu-terra-backend' }));

const port = PORT || 3000;
app.listen(port, () => console.log('Kunsi bu Terra backend a correr na porta ' + port));
