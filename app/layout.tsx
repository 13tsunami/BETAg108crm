import "@/styles/globals.css";
import Sidebar from "@/components/Sidebar";
import Providers from "@/components/Providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="app-body">
        <Providers>
          <div className="app-shell">
            <aside className="app-sidebar">
              <Sidebar />
            </aside>
            <main className="app-content">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
