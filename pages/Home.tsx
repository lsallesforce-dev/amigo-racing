import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/api/_server/const";
import { trpc } from "@/lib/trpc";
import { Calendar, MapPin, Users, ArrowRight, Filter, Globe, Trophy, Info } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ImageLightbox } from "@/components/ImageLightbox";
import Navbar from "@/components/Navbar";
import { useState, useMemo } from "react";
import { EventListItem } from "@/components/events/EventListItem";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { data: serverEvents, isLoading: isLoadingAll } = trpc.events.listAll.useQuery();

  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'internal' | 'external'>('all');

  const allEvents = useMemo(() => {
    const combined = [...(serverEvents || [])];
    // Sort by date
    return combined.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [serverEvents]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return allEvents;
    if (filter === 'internal') return allEvents.filter(e => !e.isExternal);
    if (filter === 'external') return allEvents.filter(e => e.isExternal);
    return allEvents;
  }, [allEvents, filter]);

  return (
    <div className="min-h-screen bg-neutral-950 text-foreground selection:bg-primary/30">
      <Navbar />

      {/* Hero Section - Visual mais Premium e Dark */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(234,88,12,0.15),transparent_50%)]" />
        <div className="container relative text-center">
          <Badge variant="outline" className="mb-6 border-primary/20 text-primary animate-in fade-in slide-in-from-bottom-3 duration-1000">
            🏁 A maior plataforma Off-Road do Brasil
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              ACELERE NO PRÓXIMO
            </span>
            <br />
            <span className="text-primary italic">DESAFIO.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto font-medium">
            Inscreva-se nos eventos mais brutais de Rally e Off-Road. Gestão completa da sua vida no grid.
          </p>
          <div className="flex gap-4 justify-center items-center flex-wrap">
            {!isAuthenticated && (
              <Button size="lg" asChild className="rounded-full px-8 py-6 text-lg font-bold shadow-[0_0_20px_rgba(234,88,12,0.3)] hover:shadow-[0_0_30px_rgba(234,88,12,0.5)] transition-all">
                <a href={getLoginUrl()}>
                  Criar minha Conta <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
            )}
            <Button size="lg" variant="outline" asChild className="rounded-full px-8 py-6 text-lg font-bold border-white/10 hover:bg-white/5 transition-all">
              <a href="/become-organizer">
                Sou Organizador
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Vitrine de Eventos Section */}
      <section className="py-20 px-4">
        <div className="container">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <h2 className="text-4xl font-black tracking-tight mb-2 uppercase italic flex items-center gap-3">
                <Trophy className="h-8 w-8 text-primary" />
                Próximas Provas
              </h2>
              <p className="text-muted-foreground font-medium">Explore o calendário oficial e garanta sua vaga.</p>
            </div>

            {/* Filtros Premium */}
            <div className="flex bg-muted/30 p-1 rounded-full border border-white/5 self-start md:self-auto overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setFilter('all')}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${filter === 'all' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-white'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilter('internal')}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${filter === 'internal' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-white'}`}
              >
                Nossos Eventos
              </button>
              <button
                onClick={() => setFilter('external')}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${filter === 'external' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-white'}`}
              >
                Externos
              </button>
            </div>
          </div>

          {isLoadingAll ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-muted/10 rounded-3xl border border-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredEvents.length > 0 ? (
            <div className="flex flex-col gap-2 animate-in fade-in duration-700">
              {filteredEvents.map((event, index) => (
                <EventListItem key={event.id || index} event={event} />
              ))}
            </div>
          ) : (
            <Card className="bg-transparent border-dashed border-white/10 rounded-[32px] overflow-hidden">
              <CardContent className="py-24 text-center ">
                <div className="bg-primary/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Info className="h-10 w-10 text-primary/40" />
                </div>
                <h3 className="text-3xl font-black mb-2 tracking-tight">SILÊNCIO NOS MOTORES</h3>
                <p className="text-muted-foreground font-medium max-w-sm mx-auto">
                  Nenhum evento encontrado nesta categoria. Tente mudar o filtro acima!
                </p>
                <Button variant="link" onClick={() => setFilter('all')} className="mt-4 text-primary font-bold">
                  Ver Todos os Eventos
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Stats / Proof Section */}
      <section className="py-16 border-t border-white/5 bg-neutral-950">
        <div className="container px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-black text-white mb-1 tracking-tighter">500+</div>
              <div className="text-[10px] text-primary font-black uppercase tracking-widest">Pilotos Ativos</div>
            </div>
            <div>
              <div className="text-4xl font-black text-white mb-1 tracking-tighter">150+</div>
              <div className="text-[10px] text-primary font-black uppercase tracking-widest">Provas Realizadas</div>
            </div>
            <div>
              <div className="text-4xl font-black text-white mb-1 tracking-tighter">27</div>
              <div className="text-[10px] text-primary font-black uppercase tracking-widest">Estados Atendidos</div>
            </div>
            <div>
              <div className="text-4xl font-black text-white mb-1 tracking-tighter">100%</div>
              <div className="text-[10px] text-primary font-black uppercase tracking-widest">Off-Road Raiz</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Premium */}
      <footer className="bg-neutral-950 border-t border-white/5 py-12">
        <div className="container px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start">
            <img src="/logo-light.png" alt="Amigo Racing" className="h-10 mb-4 brightness-200" />
            <p className="text-xs text-muted-foreground font-medium">© 2026 Amigo Racing. Todos os direitos reservados.</p>
          </div>
          <div className="flex gap-8 text-xs font-black uppercase tracking-widest text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Termos</a>
            <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
            <a href="#" className="hover:text-primary transition-colors">Suporte</a>
          </div>
        </div>
      </footer>

      {/* Lightbox para expandir imagens */}
      <ImageLightbox
        imageUrl={lightboxImage?.url || ""}
        alt={lightboxImage?.alt || ""}
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
}
