import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileMenuProps {
  isAuthenticated: boolean;
  userName?: string | null;
  onLogout: () => void;
  loginUrl: string;
}

export function MobileMenu({ isAuthenticated, userName, onLogout, loginUrl }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Menu Hambúrguer - Visível apenas em mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden p-2 hover:bg-accent rounded-md"
        aria-label="Toggle menu"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Menu className="h-6 w-6" />
        )}
      </button>

      {/* Menu Mobile - Dropdown */}
      {isOpen && (
        <div className="absolute top-16 left-0 right-0 bg-background border-b md:hidden shadow-lg z-40">
          <nav className="flex flex-col p-4 space-y-2">
            {isAuthenticated ? (
              <>
                <a href="/dashboard" className="w-full">
                  <Button variant="ghost" className="w-full justify-start text-base h-10">
                    Painel do Competidor
                  </Button>
                </a>
                <a href="/organizer" className="w-full">
                  <Button variant="ghost" className="w-full justify-start text-base h-10">
                    Painel Organizador
                  </Button>
                </a>
                <a href="/admin" className="w-full">
                  <Button variant="ghost" className="w-full justify-start text-base h-10">
                    Admin
                  </Button>
                </a>
                <div className="py-2 px-2 text-sm text-muted-foreground border-t">
                  Olá, {userName}
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-start text-base h-10"
                  onClick={() => {
                    onLogout();
                    setIsOpen(false);
                  }}
                >
                  Sair
                </Button>
              </>
            ) : (
              <Button asChild className="w-full justify-start text-base h-10">
                <a href={loginUrl}>Entrar</a>
              </Button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
