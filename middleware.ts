import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/sign-in" },
  callbacks: { authorized: ({ token }) => !!token },
  secret: process.env.NEXTAUTH_SECRET
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|sign-in).*)"]
};