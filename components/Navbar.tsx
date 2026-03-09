import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Menu, X, Home, LayoutDashboard, Settings, User, LogOut, Shield } from "lucide-react";
import { getLoginUrl } from "@/api/server/const";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";

export default function Navbar() {
    const { user, isAuthenticated, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const NavItems = () => (
        <>
            <Link href="/">
                <Button variant="ghost" className="justify-start gap-2 w-full md:w-auto" onClick={() => setIsOpen(false)}>
                    <Home className="h-4 w-4 md:hidden" />
                    Home
                </Button>
            </Link>
            {isAuthenticated ? (
                <>
                    <Link href="/dashboard">
                        <Button variant="ghost" className="justify-start gap-2 w-full md:w-auto" onClick={() => setIsOpen(false)}>
                            <LayoutDashboard className="h-4 w-4 md:hidden" />
                            Painel do Competidor
                        </Button>
                    </Link>
                    <Link href="/organizer">
                        <Button variant="ghost" className="justify-start gap-2 w-full md:w-auto" onClick={() => setIsOpen(false)}>
                            <Settings className="h-4 w-4 md:hidden" />
                            Painel Organizador
                        </Button>
                    </Link>
                    {user?.role === 'admin' && (
                        <Link href="/admin">
                            <Button variant="ghost" className="justify-start gap-2 w-full md:w-auto text-primary" onClick={() => setIsOpen(false)}>
                                <Shield className="h-4 w-4 md:hidden" />
                                Admin
                            </Button>
                        </Link>
                    )}
                </>
            ) : (
                <Link href="/become-organizer">
                    <Button variant="ghost" className="justify-start gap-2 w-full md:w-auto" onClick={() => setIsOpen(false)}>
                        <Settings className="h-4 w-4 md:hidden" />
                        Tornar-se Organizador
                    </Button>
                </Link>
            )}
        </>
    );

    return (
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="container flex h-16 items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                    <img src="/logo-light.png" alt="Amigo Racing" className="h-8 md:h-10 w-auto block dark:hidden" />
                    <img src="/logo-dark.png" alt="Amigo Racing" className="h-8 md:h-10 w-auto hidden dark:block" />
                    <span className="text-lg md:text-xl font-bold logo-premium">Amigo Racing</span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-2">
                    <NavItems />
                    <div className="h-6 w-px bg-border mx-2" />
                    {isAuthenticated ? (
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground hidden lg:inline-block">
                                Olá, {user?.name?.split(' ')[0]}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => logout()}
                                className="gap-2"
                            >
                                <LogOut className="h-4 w-4" />
                                Sair
                            </Button>
                        </div>
                    ) : (
                        <Button asChild size="sm">
                            <a href={getLoginUrl()} className="gap-2">
                                <User className="h-4 w-4" />
                                Entrar
                            </a>
                        </Button>
                    )}
                </nav>

                {/* Mobile Navigation */}
                <div className="md:hidden">
                    <Sheet open={isOpen} onOpenChange={setIsOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-10 h-10" aria-label="Abrir Menu">
                                <Menu className="h-6 w-6" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[85%] sm:w-[350px] p-0">
                            <SheetHeader className="p-6 border-b text-left">
                                <SheetTitle className="flex items-center gap-2">
                                    <img src="/logo-light.png" alt="Amigo Racing" className="h-8 w-auto block dark:hidden" />
                                    <img src="/logo-dark.png" alt="Amigo Racing" className="h-8 w-auto hidden dark:block" />
                                    <span className="logo-premium">Amigo Racing</span>
                                </SheetTitle>
                            </SheetHeader>
                            <div className="flex flex-col p-4 gap-2">
                                {isAuthenticated && (
                                    <div className="px-2 py-4 mb-2 bg-muted/30 rounded-lg flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                            {user?.name?.[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold truncate max-w-[200px]">{user?.name}</span>
                                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{user?.email}</span>
                                        </div>
                                    </div>
                                )}
                                <NavItems />

                                <div className="mt-4 pt-4 border-t space-y-2">
                                    {isAuthenticated ? (
                                        <Button
                                            variant="destructive"
                                            className="w-full justify-start gap-2"
                                            onClick={() => {
                                                logout();
                                                setIsOpen(false);
                                            }}
                                        >
                                            <LogOut className="h-4 w-4" />
                                            Sair da Conta
                                        </Button>
                                    ) : (
                                        <Button asChild className="w-full justify-start gap-2">
                                            <a href={getLoginUrl()}>
                                                <User className="h-4 w-4" />
                                                Entrar no Sistema
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    );
}
