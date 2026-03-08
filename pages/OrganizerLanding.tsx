import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Zap, Users, Trophy, Calendar, MapPin, Shield, TrendingUp, Lock, Headphones } from "lucide-react";

export default function OrganizerLanding() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const loginUrl = getLoginUrl();

  const handleStartRegistration = () => {
    if (user) {
      navigate("/cadastro-organizador");
    } else {
      localStorage.setItem("redirectAfterLogin", "/cadastro-organizador");
      window.location.href = loginUrl;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src="/logo-light.png" alt="Amigo Racing" className="h-8 w-auto block dark:hidden" />
            <img src="/logo-dark.png" alt="Amigo Racing" className="h-8 w-auto hidden dark:block" />
            <span className="text-2xl font-bold logo-premium">Amigo Racing</span>
          </button>
          <div className="flex gap-4">
            {user ? (
              <>
                <span className="text-slate-300 text-sm">{user.email}</span>
                <Button variant="outline" size="sm">
                  Meu Painel
                </Button>
              </>
            ) : (
              <a href={loginUrl}>
                <Button variant="outline" size="sm">
                  Entrar
                </Button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Organize Eventos Off-Road e Rally com Facilidade
          </h1>
          <p className="text-xl text-slate-300 mb-8">
            A plataforma completa para criar, gerenciar e monetizar seus eventos de automobilismo. Desde inscrições até pagamentos, tudo integrado.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-orange-500 hover:bg-orange-600 text-white px-8"
              onClick={handleStartRegistration}
            >
              Começar Agora
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-slate-600 text-white hover:bg-slate-800"
              onClick={() => {
                const element = document.getElementById("features");
                element?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Saiba Mais
            </Button>
          </div>
        </div>

        {/* Hero Image Placeholder */}
        <div className="mt-16 rounded-lg overflow-hidden border border-slate-700 bg-slate-800/50 h-96 flex items-center justify-center">
          <div className="text-slate-400 text-center">
            <img src="/logo-light.png" alt="Amigo Racing" className="w-24 h-auto mx-auto mb-4 opacity-70 grayscale hover:grayscale-0 transition-all block dark:hidden" />
            <img src="/logo-dark.png" alt="Amigo Racing" className="w-24 h-auto mx-auto mb-4 opacity-70 grayscale hover:grayscale-0 transition-all hidden dark:block" />
            <p>Sua plataforma para automovilismo off-road</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-slate-800/50 py-20 border-y border-slate-700">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-white text-center mb-16">
            Por que escolher Amigo Racing?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <Zap className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Fácil de Usar</h3>
              <p className="text-slate-300">
                Interface intuitiva para criar eventos em minutos. Sem necessidade de conhecimento técnico.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <Users className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Gerenciamento Completo</h3>
              <p className="text-slate-300">
                Controle inscrições, participantes, pagamentos e comunicação tudo em um único lugar.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <Shield className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Seguro e Confiável</h3>
              <p className="text-slate-300">
                Integração com Pagar.me para pagamentos seguros. Seus dados estão protegidos.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <Calendar className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Calendário Inteligente</h3>
              <p className="text-slate-300">
                Organize múltiplos eventos e gerencie cronogramas com facilidade.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <MapPin className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Localização Precisa</h3>
              <p className="text-slate-300">
                Compartilhe a localização do evento e facilite a chegada dos participantes.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <Trophy className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Resultados em Tempo Real</h3>
              <p className="text-slate-300">
                Acompanhe resultados e ranking dos participantes em tempo real.
              </p>
            </div>

            {/* Feature 7 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <TrendingUp className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Análises Detalhadas</h3>
              <p className="text-slate-300">
                Relatórios completos sobre seus eventos, participantes e receita.
              </p>
            </div>

            {/* Feature 8 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <Lock className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Pagamentos Seguros</h3>
              <p className="text-slate-300">
                Receba pagamentos de forma segura através da integração com Pagar.me.
              </p>
            </div>

            {/* Feature 9 */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 hover:border-orange-500 transition">
              <Headphones className="w-12 h-12 text-orange-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-3">Suporte Dedicado</h3>
              <p className="text-slate-300">
                Equipe de suporte pronta para ajudar você a ter sucesso com seus eventos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-white text-center mb-16">
          Benefícios para Organizadores
        </h2>

        <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
          <div>
            <h3 className="text-2xl font-bold text-orange-500 mb-4">💰 Monetize Seus Eventos</h3>
            <p className="text-slate-300 mb-4">
              Cobre taxa de inscrição, venda de produtos e serviços adicionais. Receba pagamentos de forma segura e transparente.
            </p>
            <ul className="space-y-2 text-slate-300">
              <li>✓ Múltiplas opções de pagamento</li>
              <li>✓ Relatórios de receita em tempo real</li>
              <li>✓ Saques automáticos</li>
            </ul>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-orange-500 mb-4">📊 Dados e Insights</h3>
            <p className="text-slate-300 mb-4">
              Acesse dados detalhados sobre seus eventos e participantes para melhorar continuamente.
            </p>
            <ul className="space-y-2 text-slate-300">
              <li>✓ Dashboard com métricas principais</li>
              <li>✓ Relatórios exportáveis</li>
              <li>✓ Análise de tendências</li>
            </ul>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-orange-500 mb-4">🚀 Crescimento Escalável</h3>
            <p className="text-slate-300 mb-4">
              Comece pequeno e escale seus eventos conforme sua comunidade cresce.
            </p>
            <ul className="space-y-2 text-slate-300">
              <li>✓ Suporte para eventos de qualquer tamanho</li>
              <li>✓ Ferramentas de marketing integradas</li>
              <li>✓ Comunidade de organizadores</li>
            </ul>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-orange-500 mb-4">🎯 Foco no Essencial</h3>
            <p className="text-slate-300 mb-4">
              Deixe a plataforma cuidar da logística enquanto você se concentra na experiência do evento.
            </p>
            <ul className="space-y-2 text-slate-300">
              <li>✓ Automação de tarefas repetitivas</li>
              <li>✓ Comunicação automática com participantes</li>
              <li>✓ Gestão simplificada</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-slate-800/50 py-20 border-y border-slate-700">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Preços Transparentes</h2>
          <p className="text-xl text-slate-300 mb-12">
            Sem taxas escondidas. Você paga apenas quando recebe.
          </p>

          <div className="max-w-2xl mx-auto bg-slate-800 border border-slate-700 rounded-lg p-8">
            <h3 className="text-2xl font-bold text-white mb-4">Taxa de Plataforma</h3>
            <p className="text-5xl font-bold text-orange-500 mb-2">2.99%</p>
            <p className="text-slate-300 mb-6">+ taxa de processamento do Pagar.me</p>
            <p className="text-slate-400">
              Você recebe 97% do valor de cada inscrição, menos apenas a taxa de processamento de pagamento.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-4xl font-bold text-white mb-6">Pronto para começar?</h2>
        <p className="text-xl text-slate-300 mb-8">
          Crie sua conta e organize seu primeiro evento em minutos.
        </p>
        <Button
          size="lg"
          className="bg-orange-500 hover:bg-orange-600 text-white px-8"
          onClick={handleStartRegistration}
        >
          Começar Agora
        </Button>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-700 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="text-white font-bold mb-4">Amigo Racing</h4>
              <p className="text-slate-400">Plataforma de eventos off-road e rally</p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Produto</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Recursos
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Preços
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Empresa</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Sobre
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Contato
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Carreiras
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Privacidade
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Termos
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500">
                    Cookies
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center text-slate-400">
            <p>&copy; 2026 Amigo Racing. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
