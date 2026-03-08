import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const loginUrl = getLoginUrl();

  const handleBecomOrganizer = () => {
    if (user) {
      navigate("/organizador-landing");
    } else {
      // Guardar intent e redirecionar para login
      localStorage.setItem("redirectAfterLogin", "/organizador-landing");
      window.location.href = loginUrl;
    }
  };

  const handleParticipant = () => {
    if (user) {
      navigate("/eventos");
    } else {
      window.location.href = loginUrl;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏁</span>
            <h1 className="text-xl font-bold text-white">Amigo Racing</h1>
          </div>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-300">{user.email}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/painel-organizador")}
              >
                Meu Painel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => (window.location.href = loginUrl)}
            >
              Entrar
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-white mb-4">
            Bem-vindo ao Amigo Racing
          </h2>
          <p className="text-xl text-slate-300">
            A plataforma completa para eventos de automobilismo off-road e rally
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Participante Card */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 hover:border-slate-600 transition">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-2xl font-bold text-white mb-4">Participante</h3>
            <p className="text-slate-300 mb-6">
              Inscreva-se em eventos, acompanhe resultados em tempo real e conecte-se com outros pilotos.
            </p>
            <ul className="text-slate-300 mb-8 space-y-2">
              <li>✓ Inscrição em eventos</li>
              <li>✓ Resultados em tempo real</li>
              <li>✓ Histórico de participações</li>
              <li>✓ Comunidade de pilotos</li>
            </ul>
            <Button
              className="w-full"
              variant="outline"
              onClick={handleParticipant}
            >
              Participar de um Evento
            </Button>
          </div>

          {/* Organizador Card */}
          <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-lg border border-orange-500 p-8 hover:border-orange-400 transition">
            <div className="text-4xl mb-4">🏆</div>
            <h3 className="text-2xl font-bold text-white mb-4">Organizador</h3>
            <p className="text-orange-100 mb-6">
              Crie e gerencie seus próprios eventos, receba inscrições e monetize sua plataforma.
            </p>
            <ul className="text-orange-100 mb-8 space-y-2">
              <li>✓ Criar eventos</li>
              <li>✓ Gerenciar inscrições</li>
              <li>✓ Receber pagamentos</li>
              <li>✓ Relatórios detalhados</li>
            </ul>
            <Button
              className="w-full bg-white text-orange-600 hover:bg-orange-50"
              onClick={handleBecomOrganizer}
            >
              Ser um Organizador
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-20 pt-20 border-t border-slate-700">
          <h3 className="text-3xl font-bold text-white text-center mb-12">
            Por que escolher Amigo Racing?
          </h3>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="text-3xl mb-3">🚗</div>
              <h4 className="text-lg font-semibold text-white mb-2">
                Fácil de Usar
              </h4>
              <p className="text-slate-400">
                Interface intuitiva para criar e gerenciar eventos em minutos
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">💰</div>
              <h4 className="text-lg font-semibold text-white mb-2">
                Monetização
              </h4>
              <p className="text-slate-400">
                Receba pagamentos de forma segura e transparente
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">📊</div>
              <h4 className="text-lg font-semibold text-white mb-2">
                Análises
              </h4>
              <p className="text-slate-400">
                Relatórios detalhados sobre seus eventos e participantes
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 mt-20">
        <div className="container mx-auto px-4 py-8 text-center text-slate-400">
          <p>&copy; 2026 Amigo Racing. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
