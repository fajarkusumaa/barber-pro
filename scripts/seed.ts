import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db, branches, capsters, capsterSchedules, timeOffs, customers, bookings } from '../src/db';
import { sql } from 'drizzle-orm';

export async function runSeed(database = db) {
  console.log('🌱 Starting database seed...');

  // Optional: clear existing records in reverse dependency order
  await database.execute(sql`TRUNCATE TABLE bookings, time_offs, capster_schedules, capsters, branches, chat_messages, chat_sessions, customers RESTART IDENTITY CASCADE`);

  // 1. Create 1 Branch
  const [branch] = await database
    .insert(branches)
    .values({
      name: 'BarberBot Solo Grand Mall',
      address: 'Jl. Slamet Riyadi No. 123, Surakarta',
      isActive: true,
    })
    .returning();

  console.log(`✅ Branch created: ${branch.name} (ID: ${branch.id})`);

  // 2. Create 3 Capsters
  const capsterData = [
    { name: 'Budi (Senior Barber)', branchId: branch.id, isActive: true },
    { name: 'Anton (Fade Specialist)', branchId: branch.id, isActive: true },
    { name: 'Dimas (Stylist)', branchId: branch.id, isActive: true },
  ];

  const createdCapsters = await database.insert(capsters).values(capsterData).returning();
  console.log(`✅ ${createdCapsters.length} Capsters created`);

  // 3. Create Schedules for each capster
  const schedulesToInsert = [];

  // Budi: Senin - Sabtu (1..6), Jam: 09:00-12:00, 13:00-17:00, 18:00-21:00
  const budi = createdCapsters[0];
  for (let day = 1; day <= 6; day++) {
    schedulesToInsert.push(
      { capsterId: budi.id, dayOfWeek: day, startTime: '09:00', endTime: '12:00' },
      { capsterId: budi.id, dayOfWeek: day, startTime: '13:00', endTime: '17:00' },
      { capsterId: budi.id, dayOfWeek: day, startTime: '18:00', endTime: '21:00' }
    );
  }

  // Anton: Senin - Jumat (1..5) & Minggu (0), Jam: 10:00-14:00, 15:00-19:00
  const anton = createdCapsters[1];
  for (const day of [1, 2, 3, 4, 5, 0]) {
    schedulesToInsert.push(
      { capsterId: anton.id, dayOfWeek: day, startTime: '10:00', endTime: '14:00' },
      { capsterId: anton.id, dayOfWeek: day, startTime: '15:00', endTime: '19:00' }
    );
  }

  // Dimas: Selasa - Minggu (2..6, 0), Jam: 13:00-17:00, 18:00-22:00
  const dimas = createdCapsters[2];
  for (const day of [2, 3, 4, 5, 6, 0]) {
    schedulesToInsert.push(
      { capsterId: dimas.id, dayOfWeek: day, startTime: '13:00', endTime: '17:00' },
      { capsterId: dimas.id, dayOfWeek: day, startTime: '18:00', endTime: '22:00' }
    );
  }

  await database.insert(capsterSchedules).values(schedulesToInsert);
  console.log(`✅ ${schedulesToInsert.length} Schedule shifts created`);

  console.log('🎉 Seeding completed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
