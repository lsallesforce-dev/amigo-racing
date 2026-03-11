import { format, isToday, isTomorrow, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, ArrowRight, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EventListItemProps {
    event: {
        id?: number | string;
        name?: string;
        startDate?: string | Date;
        city?: string;
        state?: string;
        imageUrl?: string;
        isExternal?: boolean;
        externalUrl?: string;
        organizerLogo?: string;
    };
}

export function EventListItem({ event }: EventListItemProps) {
    const startDate = event.startDate ? new Date(event.startDate) : new Date();
    const day = event.startDate ? format(startDate, "dd") : "--";
    const month = event.startDate ? format(startDate, "MMM", { locale: ptBR }).toUpperCase() : "---";

    let timeBadge = null;
    if (event.startDate) {
        if (isToday(startDate)) timeBadge = "HOJE";
        else if (isTomorrow(startDate)) timeBadge = "AMANHÃ";
        else {
            const daysUntil = differenceInDays(startDate, new Date());
            if (daysUntil > 0 && daysUntil <= 15) timeBadge = "PRÓXIMO";
        }
    }

    return (
        <div className="group relative bg-[#111] border border-white/5 hover:border-primary/40 transition-all duration-500 rounded-3xl overflow-hidden shadow-2xl hover:shadow-primary/5 mb-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center p-4 md:p-6 gap-6">

                {/* Left: Date Block & Logo */}
                <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex flex-col items-center justify-center min-w-[70px] shadow-xl group-hover:bg-primary group-hover:border-primary transition-colors duration-500">
                        <span className="text-2xl font-black leading-none text-white">{day}</span>
                        <span className="text-[10px] font-black tracking-widest text-primary group-hover:text-white transition-colors duration-500">
                            {month}
                        </span>
                    </div>

                    {(event.organizerLogo || event.imageUrl) && (
                        <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-black/40 p-1 flex items-center justify-center">
                            <img
                                src={event.imageUrl || event.organizerLogo}
                                alt="Organizer"
                                className="w-full h-full object-contain brightness-90 group-hover:brightness-110 transition-all"
                            />
                        </div>
                    )}
                </div>

                {/* Center: Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {timeBadge && (
                            <Badge className="text-[9px] uppercase tracking-tighter font-black border-green-500/50 text-green-400 px-2 py-0 bg-green-500/10 shadow-sm shadow-green-500/10 animate-pulse">
                                ⏳ {timeBadge}
                            </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] uppercase tracking-tighter font-black border-primary/20 text-primary px-2 py-0 bg-primary/5">
                            {event.isExternal ? "Evento Externo" : "PRO Platform"}
                        </Badge>
                    </div>
                    <h3 className="text-xl md:text-2xl font-black tracking-tight text-white group-hover:text-primary transition-colors truncate">
                        {event.name || "Evento Sem Nome"}
                    </h3>
                    <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-sm mt-1">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span>{event.city || "Local a definir"}/{event.state || 'SP'}</span>
                    </div>
                </div>

                {/* Right: Button */}
                <div className="flex-shrink-0">
                    <Button asChild className="w-full md:w-auto bg-primary text-white hover:bg-primary/80 font-black uppercase italic tracking-tighter px-8 py-6 rounded-2xl transition-all shadow-xl hover:-translate-y-1 active:scale-95 border-none">
                        {event.isExternal && event.externalUrl ? (
                            <a href={event.externalUrl} target="_blank" rel="noopener noreferrer">
                                <div className="flex items-center gap-2">
                                    Informações
                                    <ArrowRight className="h-5 w-5" />
                                </div>
                            </a>
                        ) : (
                            <Link href={`/events/${event.id || '#'}`}>
                                <div className="flex items-center gap-2">
                                    {event.isExternal ? 'Informações' : 'Inscrever-se'}
                                    <ArrowRight className="h-5 w-5" />
                                </div>
                            </Link>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
