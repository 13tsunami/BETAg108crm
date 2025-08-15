// prisma/seed.cjs
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const username = "admin";
  const password = "admin123";
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      name: "Администратор",
      username,
      email: "admin@example.com",
      role: "director",
      passwordHash,
    },
  });

  console.log("OK: админ:", { id: admin.id, username: admin.username, role: admin.role });
}

main().catch((e) => {
  console.error("SEED ERROR:", e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});