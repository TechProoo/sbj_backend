/*
 * Generates a VAPID key pair for web push.
 *
 *   npm run push-keys
 *
 * The public half goes to browsers so they can create a subscription; the
 * private half signs the pushes. Changing them invalidates every existing
 * subscription, so generate once and keep them.
 */
import * as webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('');
console.log('Add these to backend/.env:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:orders@sbjfoods.com');
console.log('');
console.log('And the public key to frontend/.env:');
console.log('');
console.log(`VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log('');
