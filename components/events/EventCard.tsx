import { format, isToday, isTomorrow, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, MapPin, ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EventCardProps {
    event: {
        id: number;
        name: string;
        description?: string;
        startDate: string | Date;
        location?: string;
        city: string;
        state?: string;
        imageUrl?: string;
        isExternal?: boolean;
        status?: string;
    };
}

export function EventCard({ event }: EventCardProps) {
    const startDate = new Date(event.startDate);

    let timeBadge = null;
    if (isToday(startDate)) timeBadge = "Hoje";
    else if (isTomorrow(startDate)) timeBadge = "Amanhã";
    else {
        const daysUntil = differenceInDays(startDate, new Date());
        if (daysUntil > 0 && daysUntil <= 15) timeBadge = "Próximo";
    }

    return (
        <div className="group rounded-xl shadow-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden flex flex-col transition-all hover:shadow-lg hover:border-primary/50">
            {/* Card Header: Image or Placeholder with Date */}
            <div className="relative h-48 w-full bg-gray-100 dark:bg-zinc-900 overflow-hidden">
                {event.imageUrl ? (
                    <img
                        src={encodeURI(event.imageUrl)}
                        alt={event.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                        <Calendar className="h-12 w-12 text-primary/20" />
                    </div>
                )}

                {/* Date Overlay */}
                <div className="absolute top-4 left-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col items-center min-w-[50px]">
                    <span className="text-xs font-bold uppercase text-primary">
                        {format(startDate, "MMM", { locale: ptBR })}
                    </span>
                    <span className="text-xl font-black text-gray-900 dark:text-gray-100">
                        {format(startDate, "dd")}
                    </span>
                </div>

                {/* Badge */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
                    {timeBadge && (
                        <Badge className="bg-green-500/90 hover:bg-green-600 text-white shadow-lg transition-transform hover:scale-105 border-transparent font-bold">
                            ⏳ {timeBadge}
                        </Badge>
                    )}
                    <Badge
                        variant={event.isExternal ? "outline" : "default"}
                        className={event.isExternal
                            ? "bg-amber-100/80 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                            : "bg-primary/90 text-primary-foreground"
                        }
                    >
                        {event.isExternal ? "Externo" : "Plataforma"}
                    </Badge>
                </div>
            </div>

            {/* Card Body */}
            <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight line-clamp-2 min-h-[3.5rem]">
                        {event.name}
                    </h3>
                    {event.isExternal && <ExternalLink className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />}
                </div>

                <div className="space-y-2 mt-auto">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span className="truncate">{event.city}, {event.state || 'SP'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-500">
                        <Calendar className="h-4 w-4" />
                        <span>{format(startDate, "EEEE", { locale: ptBR })}</span>
                    </div>
                </div>
            </div>

            <div className="p-5 pt-0 mt-auto">
                <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20">
                    <Link href={`/events/${event.id}`}>
                        <div className="flex items-center justify-center w-full">
                            {event.isExternal ? "Ver Detalhes" : "Inscrever-se"}
                            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover/btn:translate-x-1" />
                        </div>
                    </Link>
                </Button>
            </div>
        </div>
    );
}
