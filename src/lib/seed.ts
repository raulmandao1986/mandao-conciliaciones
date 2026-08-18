import { collection, doc, setDoc, getDocs, query, limit, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { initialMessengersCSV } from './initialMessengersCSV';
import { initialBusinessesCSV } from './initialBusinessesCSV';

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .trim()
    .replace(/\s+/g, '-') // replace spaces with hyphens
    .replace(/[^\w-]+/g, ''); // remove non-word chars
}

function parseCSVRow(rowStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === '"') {
      if (inQuotes && rowStr[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSVRows(csvText: string): string[][] {
  const lines = csvText.split(/\r?\n/);
  const rows: string[][] = [];
  let currentLine = '';

  for (const line of lines) {
    if (currentLine) {
      currentLine += ' ' + line;
    } else {
      currentLine = line;
    }
    const quoteCount = (currentLine.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      if (currentLine.trim()) {
        rows.push(parseCSVRow(currentLine));
      }
      currentLine = '';
    }
  }
  if (currentLine.trim()) {
    rows.push(parseCSVRow(currentLine));
  }
  return rows;
}

export async function clearBusinessesCollection() {
  console.log('Clearing existing businesses collection...');
  try {
    const snap = await getDocs(collection(db, 'businesses'));
    if (snap.empty) {
      console.log('Businesses collection is already empty.');
      return;
    }
    const batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;

    for (const docSnap of snap.docs) {
      currentBatch.delete(doc(db, 'businesses', docSnap.id));
      count++;
      if (count % 400 === 0) {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
      }
    }
    if (count % 400 !== 0) {
      batches.push(currentBatch.commit());
    }
    await Promise.all(batches);
    console.log(`Cleared ${count} documents from businesses collection.`);
  } catch (err) {
    console.error('Error clearing businesses collection:', err);
  }
}

export async function seedBusinesses() {
  try {
    console.log('Parsing initial businesses CSV...');
    const rows = parseCSVRows(initialBusinessesCSV);
    if (rows.length < 2) {
      console.warn('CSV has no data rows.');
      return 0;
    }

    const usedIds = new Set<string>();
    let count = 0;
    const batches = [];
    let currentBatch = writeBatch(db);

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length === 0) continue;

      const negocio = (cols[0] || '').trim();
      if (!negocio || negocio.toLowerCase() === 'negocios' || negocio.toLowerCase() === 'negocio') continue;

      const metodoPago = (cols[1] || 'Transferencia').trim();
      const isBloqueadoStr = (cols[2] || '').trim().toUpperCase();
      const isBloqueado = isBloqueadoStr === 'TRUE';
      const estado = isBloqueado ? 'bloqueado' : 'activo';

      const contacto = (cols[3] || '').trim();
      const telefono = (cols[4] || '').trim();
      const correo = (cols[5] || '').trim();
      const nombreContrato = (cols[6] || '').trim();
      const nit = (cols[7] || '').trim();
      const direccion = (cols[8] || '').trim();
      const area = (cols[9] || 'La Habana').trim();

      let baseDocId = slugify(negocio).replace(/[^a-zA-Z0-9_-]/g, '') || 'negocio';
      let docId = baseDocId.slice(0, 100);
      let suffix = 1;
      while (usedIds.has(docId)) {
        suffix++;
        docId = `${baseDocId.slice(0, 90)}-${suffix}`;
      }
      usedIds.add(docId);

      const businessDoc = {
        negocio,
        metodoPago,
        estado,
        contacto,
        telefono,
        correo,
        nombreContrato,
        noContrato: nombreContrato,
        nit,
        direccion,
        area,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      currentBatch.set(doc(db, 'businesses', docId), businessDoc);
      count++;

      if (count % 400 === 0) {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
      }
    }

    if (count % 400 !== 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
    console.log(`Seeded ${count} businesses successfully in batch!`);
    return count;
  } catch (err) {
    console.error('Error seeding businesses:', err);
    throw err;
  }
}

export async function reseedBusinesses() {
  await clearBusinessesCollection();
  const count = await seedBusinesses();
  localStorage.setItem('businesses_reseeded_v6', 'true');
  return count;
}

async function seedMessengers() {
  try {
    console.log('Parsing initial messengers CSV...');
    const lines = initialMessengersCSV.split('\n');
    let count = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cols = line.split(',');
      if (cols.length < 5) continue;
      
      const nombre = (cols[0] || '').trim();
      if (!nombre || nombre === 'Mensajeros') continue; // Skip header or empty rows
      
      const ci = (cols[1] || '').trim();
      const telefono = (cols[2] || '').trim();
      const tarjetaFiscal = (cols[3] || '').trim();
      const cuentaFiscal = (cols[4] || '').trim();
      const tipoMochila = (cols[5] || 'Grande').trim();
      const viaPago = (cols[6] || 'Efectivo').trim();
      const fechaAlta = (cols[7] || '').trim();
      const fechaBaja = (cols[8] || '').trim();
      
      const isBloqueadoStr = (cols[9] || '').trim().toUpperCase();
      const isBloqueado = isBloqueadoStr === 'TRUE';
      const estado = isBloqueado ? 'bloqueado' : 'activo';
      
      const area = (cols[10] || 'La Habana').trim();
      const comentarios = (cols[11] || '').trim();
      
      const docId = slugify(nombre);
      if (!docId) continue;
      
      const messengerDoc = {
        nombre,
        ci,
        telefono,
        tarjetaFiscal,
        cuentaFiscal,
        tipoMochila,
        viaPago,
        fechaAlta,
        fechaBaja,
        estado,
        area,
        comentarios,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'messengers', docId), messengerDoc, { merge: true });
      count++;
    }
    console.log(`Seeded ${count} messengers successfully!`);
  } catch (err) {
    console.error('Error seeding messengers:', err);
  }
}

export async function seedDatabase() {
  console.log('Seeding check. Checking collections individually...');

  // Direct cleanup of previously seeded mock/virtual Negocios, Mensajeros, and Orders
  try {
    const mockBusinesses = ['B-001', 'B-002', 'B-003'];
    const mockMessengers = ['M-001', 'M-002'];
    const mockOrders = ['ORD-101', 'ORD-102', 'ORD-103'];

    for (const id of mockBusinesses) {
      await deleteDoc(doc(db, 'businesses', id));
    }
    for (const id of mockMessengers) {
      await deleteDoc(doc(db, 'messengers', id));
    }
    for (const id of mockOrders) {
      await deleteDoc(doc(db, 'orders', id));
    }
    console.log('Successfully cleaned up any previously seeded mock/virtual Negocios, Mensajeros, and Orders.');
  } catch (e) {
    console.warn("Error cleaning up mock documents:", e);
  }

  // 3. Examples for Roles
  try {
    const snap = await getDocs(query(collection(db, 'roles'), limit(1)));
    if (snap.empty) {
      console.log('Seeding roles...');
      const roles = [
        { id: 'ROL-01', nombre: 'Super Admin', descripcion: 'Acceso total', permisos: ['all'], usuariosAsignados: 1 },
        { id: 'ROL-02', nombre: 'Operador', descripcion: 'Gestión limitada', permisos: ['dashboard', 'gestion-negocios'], usuariosAsignados: 0 }
      ];
      for (const r of roles) {
        await setDoc(doc(db, 'roles', r.id), r);
      }
    } else {
      console.log('Collection roles is not empty. Skipping.');
    }
  } catch (e) {
    console.warn("Error checking or seeding roles:", e);
  }

  // 4. Examples for Users
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(1)));
    if (snap.empty) {
      console.log('Seeding users...');
      const userExamples = [
        {
          nombre: 'Raúl Mandao',
          email: 'raul@mandao.app',
          rol: 'Super Admin',
          estado: 'activo',
          ultimoAcceso: 'Nunca',
          modulosActivos: { negocios: true, mensajeros: true }
        },
        {
          nombre: 'Operador de Práctica',
          email: 'operador@mandao.app',
          rol: 'Operador',
          estado: 'activo',
          ultimoAcceso: 'Nunca',
          modulosActivos: { negocios: true, mensajeros: true }
        }
      ];
      let i = 1;
      for (const u of userExamples) {
        await setDoc(doc(db, 'users', `USR-0${i}`), u);
        i++;
      }
    } else {
      console.log('Collection users is not empty. Skipping.');
    }
  } catch (e) {
    console.warn("Error checking or seeding users:", e);
  }

  // 6. Seeds for Areas
  try {
    const snap = await getDocs(query(collection(db, 'Areas'), limit(1)));
    if (snap.empty) {
      console.log('Seeding Areas...');
      const areaExamples = [
        {
          id: 'A-001',
          nombre: 'La Habana Central',
          provincia: 'Habana',
          descripcion: 'Área principal de operaciones en La Habana',
          estado: 'activo',
          spreadsheetId: '1T8rY-eN_9b95S6HOnK-sXjVnF15OqOAtVqEAtA9L6cM',
          createdAt: new Date().toISOString()
        },
        {
          id: 'A-002',
          nombre: 'Holguín Centro',
          provincia: 'Holguin',
          descripcion: 'Sucursal centro de Holguín',
          estado: 'activo',
          spreadsheetId: '',
          createdAt: new Date().toISOString()
        },
        {
          id: 'A-003',
          nombre: 'Provincia Artemisa',
          provincia: 'Provincias',
          descripcion: 'Operaciones fuera del casco urbano central',
          estado: 'activo',
          spreadsheetId: '',
          createdAt: new Date().toISOString()
        }
      ];
      for (const a of areaExamples) {
        await setDoc(doc(db, 'Areas', a.id), a);
      }
    } else {
      console.log('Collection Areas is not empty. Skipping.');
    }
  } catch (e) {
    console.warn("Error checking or seeding Areas:", e);
  }

  // 7. Seeds for MetodosPago
  try {
    const snap = await getDocs(query(collection(db, 'MetodosPago'), limit(1)));
    if (snap.empty) {
      console.log('Seeding MetodosPago...');
      const pMethodExamples = [
        { id: 'MP-01', nombre: 'Transferencia', descripcion: 'Conciliación vía transferencia bancaria standard (Bancos cubanos)', aplicaNegocios: true, aplicaMensajeros: false, estado: 'activo' },
        { id: 'MP-02', nombre: 'Transferencia-Efectivo', descripcion: 'Mixto: parte transferencia y parte en metálico', aplicaNegocios: true, aplicaMensajeros: false, estado: 'activo' },
        { id: 'MP-03', nombre: 'Efectivo', descripcion: 'Lógica puramente física en moneda CUP', aplicaNegocios: true, aplicaMensajeros: false, estado: 'activo' },
        { id: 'MP-04', nombre: 'Transferencia-Especial', descripcion: 'Criterio preferencial de cuentas corporativas', aplicaNegocios: true, aplicaMensajeros: false, estado: 'activo' },
        { id: 'MP-05', nombre: 'Transferencia-Exterior', descripcion: 'Pagos mediante pasarelas internacionales (Zelle / Tropipay / Bizum)', aplicaNegocios: true, aplicaMensajeros: false, estado: 'activo' },
        { id: 'MP-06', nombre: 'Transferencia-Saldo', descripcion: 'Descuento o recarga sobre el saldo Mandao acumulado', aplicaNegocios: true, aplicaMensajeros: false, estado: 'activo' }
      ];
      for (const pm of pMethodExamples) {
        await setDoc(doc(db, 'MetodosPago', pm.id), pm);
      }
    } else {
      console.log('Collection MetodosPago is not empty. Skipping.');
    }

    // One-time migration to ensure messenger payment methods start empty as requested
    const migrationKey = 'migration_mensajeros_payment_methods_empty_v2';
    if (!localStorage.getItem(migrationKey)) {
      console.log('Running migration to empty out seeded messenger payment methods...');
      const allMethodsSnap = await getDocs(collection(db, 'MetodosPago'));
      for (const d of allMethodsSnap.docs) {
        const data = d.data();
        // If it was one of our default ones, set aplicaMensajeros: false
        if (d.id.startsWith('MP-')) {
          await updateDoc(doc(db, 'MetodosPago', d.id), {
            aplicaMensajeros: false
          });
        }
      }
      localStorage.setItem(migrationKey, 'true');
      console.log('Migration completed successfully!');
    }
  } catch (e) {
    console.warn("Error checking or seeding MetodosPago:", e);
  }

  // 8. Seeds for RazonCambio
  try {
    const snap = await getDocs(query(collection(db, 'RazonCambio'), limit(1)));
    if (snap.empty) {
      console.log('Seeding RazonCambio...');
      const rateExamples = [
        {
          id: 'RC-01',
          nombre: 'Tasa del Mercado Informal (CUP / USD)',
          tasaCUP: 320.00,
          descripcion: 'Valor de referencia ponderado para conversiones internacionales',
          estado: 'activo',
          fechaActualizacion: new Date().toISOString().split('T')[0]
        }
      ];
      for (const r of rateExamples) {
        await setDoc(doc(db, 'RazonCambio', r.id), r);
      }
    } else {
      console.log('Collection RazonCambio is not empty. Skipping.');
    }
  } catch (e) {
    console.warn("Error checking or seeding RazonCambio:", e);
  }

  // 9. Seeds for disponibilidad_verification_history
  try {
    const snap = await getDocs(query(collection(db, 'disponibilidad_verification_history'), limit(1)));
    if (snap.empty) {
      console.log('Seeding disponibilidad_verification_history...');
      const dummyHistory = {
        area: 'La Habana Central',
        areaId: 'A-001',
        fecha: new Date().toISOString(),
        usuario: 'system@mandao.app',
        rangoInicio: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
        rangoFin: new Date().toISOString().split('T')[0],
        totalLeidos: 0,
        totalIncidencias: 0,
        tipo: 'verificacion',
        status: 'correcta'
      };
      await setDoc(doc(db, 'disponibilidad_verification_history', 'INIT-HIST-001'), dummyHistory);
    }
  } catch (e) {
    console.warn("Error checking or seeding disponibilidad_verification_history:", e);
  }

  // 10. Seeds for messengers (from CSV)
  try {
    const snap = await getDocs(query(collection(db, 'messengers'), limit(1)));
    if (snap.empty) {
      console.log('Seeding messengers from initial CSV because collection is empty...');
      await seedMessengers();
    } else {
      console.log('Messengers collection is not empty. Skipping.');
    }
  } catch (e) {
    console.warn("Error seeding messengers:", e);
  }

  // 11. Seeds for businesses (from CSV)
  try {
    const snap = await getDocs(collection(db, 'businesses'));
    console.log(`Current business count in Firestore: ${snap.size}`);
    if (snap.size < 200) {
      console.log('Fewer than 200 businesses found in Firestore. Reseeding all 245 businesses from CSV...');
      await reseedBusinesses();
    } else {
      console.log(`Businesses collection is full (${snap.size} records). Skipping.`);
    }
  } catch (e) {
    console.warn("Error seeding businesses:", e);
  }

  localStorage.setItem('database_seeded_v1', 'true');
  console.log('Individual collection checks and seeding completed successfully!');
}
