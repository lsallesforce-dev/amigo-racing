import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, X, Bot, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "model";
  content: string;
}

export default function ZequinhaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", content: "Olá! Eu sou o Zequinha, assistente técnico da Amigo Racing. Como posso ajudar seu rali hoje?" }
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const askMutation = trpc.zequinha.ask.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "model", content: data.answer }]);
    },
    onError: (error) => {
      console.error("Zequinha Error:", error);
      setMessages(prev => [...prev, { role: "model", content: "Ops, tive um problema técnico na trilha. Tente novamente ou fale com nosso suporte via WhatsApp!" }]);
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = () => {
    if (!input.trim() || askMutation.isPending) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");

    askMutation.mutate({
      question: userMessage,
      history: messages 
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4">
      {/* Chat Window */}
      {isOpen && (
        <Card className="w-[350px] md:w-[400px] h-[550px] flex flex-col shadow-2xl border-primary/20 bg-neutral-950 animate-in slide-in-from-bottom-5 duration-300">
          <CardHeader className="bg-primary/10 border-b border-primary/10 p-4 flex flex-row items-center justify-between shrink-0 rounded-t-xl">
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <div className="bg-primary h-8 w-8 rounded-full flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-black leading-none uppercase italic text-sm">Zequinha AI</span>
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </span>
              </div>
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-white h-8 w-8">
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden p-0 bg-[radial-gradient(circle_at_50%_0%,rgba(234,88,12,0.05),transparent_70%)]">
            <div 
              ref={scrollRef}
              className="h-full overflow-y-auto p-4 pb-20 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-primary/20"
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3 max-w-[90%] h-auto shrink-0",
                    msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                  )}
                >
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border",
                    msg.role === "user" ? "bg-white/5 border-white/10" : "bg-primary/10 border-primary/20"
                  )}>
                    {msg.role === "user" ? <User className="h-4 w-4 text-white/50" /> : <Bot className="h-4 w-4 text-primary" />}
                  </div>
                  <div className={cn(
                    "p-3 rounded-2xl text-sm leading-relaxed h-auto",
                    msg.role === "user" 
                      ? "bg-primary text-white font-medium rounded-tr-none shadow-lg shadow-primary/10" 
                      : "bg-white/5 border border-white/10 text-neutral-200 rounded-tl-none"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {askMutation.isPending && (
                <div className="flex gap-3 max-w-[85%] mr-auto">
                  <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    <span className="text-xs text-muted-foreground italic font-medium">Consultando manual...</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="p-4 border-t border-white/5 bg-neutral-950 shrink-0 rounded-b-xl">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex w-full gap-2"
            >
              <Input
                placeholder="Pergunte ao Zequinha..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                className="bg-white/5 border-white/10 focus-visible:ring-primary focus-visible:border-primary/50 text-white placeholder:text-muted-foreground/50 h-10"
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim() || askMutation.isPending}
                className="bg-primary hover:bg-orange-600 shadow-lg shadow-primary/20 transition-all shrink-0 h-10 w-10"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}

      {/* Toggle Button */}
      <Button
        size="lg"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-16 w-16 rounded-full shadow-[0_0_20px_rgba(234,88,12,0.4)] hover:shadow-[0_0_30px_rgba(234,88,12,0.6)] transition-all flex items-center justify-center p-0 overflow-hidden group border-none",
          isOpen ? "bg-neutral-900 ring-2 ring-white/10" : "bg-primary"
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white group-hover:scale-110 transition-transform" />
        ) : (
          <div className="relative">
             <MessageSquare className="h-8 w-8 text-white group-hover:scale-110 transition-transform" />
             <span className="absolute -top-1 -right-1 bg-white text-primary text-[10px] font-black px-1.5 rounded-full animate-bounce uppercase">AI</span>
          </div>
        )}
      </Button>
    </div>
  );
}
