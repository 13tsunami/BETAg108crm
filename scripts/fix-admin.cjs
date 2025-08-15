const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();
(async () => {
  const username = "admin";
  const passwordHash = await bcrypt.hash("admin123", 10);
  const u = await prisma.user.findUnique({ where: { username }});
  if(!u){ console.log("admin ?? ??????"); process.exit(1); }
  const up = await prisma.user.update({ where: { username }, data: { passwordHash, role: "director", email: u.email ?? "admin@example.com", name: u.name ?? "?????????????" }});
  console.log("admin ????????:", { id: up.id, role: up.role });
  await prisma.$disconnect();
})();
