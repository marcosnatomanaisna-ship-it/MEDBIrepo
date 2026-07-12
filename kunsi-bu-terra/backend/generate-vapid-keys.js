// Corre UMA VEZ: node generate-vapid-keys.js
// Copia o resultado para as variáveis de ambiente VAPID_PUBLIC_KEY e
// VAPID_PRIVATE_KEY no Render. A chave pública também tem de ir para o
// frontend (ver frontend-patch/push-client-snippet.js).
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
