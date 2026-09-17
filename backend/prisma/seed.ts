import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const doctors = await Promise.all(
    [
      { name: "Dr. Asha Rao", specialty: "General Physician" },
      { name: "Dr. Rohan Mehta", specialty: "Pediatrics" },
      { name: "Dr. Priya Nair", specialty: "Dermatology" },
    ].map((d) => prisma.doctor.create({ data: d }))
  );

  const patients = await Promise.all(
    [
      { name: "Samantha Lee", phone: "555-0101" },
      { name: "John Carter", phone: "555-0102" },
      { name: "Meera Iyer", phone: "555-0103" },
    ].map((p) => prisma.patient.create({ data: p }))
  );

  console.log(`Seeded ${doctors.length} doctors and ${patients.length} patients.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
