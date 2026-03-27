const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ ERROR: No se encontró 'serviceAccountKey.json' en la carpeta server.");
  console.error("Por favor, descárgalo desde la consola de Firebase (Project Settings -> Service accounts -> Generate new private key) y colócalo aquí.");
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = '18C4S2wvCAYNUsmNc60u2oocaqX2';

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`✅ Éxito: Se ha asignado el rol de administrador al usuario con UID: ${uid}`);
    console.log("El usuario deberá cerrar sesión y volver a ingresar para que los cambios tengan efecto en su token.");
    process.exit(0);
  })
  .catch(error => {
    console.error("❌ Error asignando el rol:", error);
    process.exit(1);
  });
