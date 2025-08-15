// scripts/upsert-admin.cjs
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

(async () => {
  const username = "admin";
  const password = "admin123";
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, role: "director", name: "Администратор", email: "admin@example.com" },
    create: { username, passwordHash, role: "director", name: "Администратор", email: "admin@example.com" },
  });

  console.log("OK: admin готов:", { id: admin.id, username: admin.username, role: admin.role });
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
