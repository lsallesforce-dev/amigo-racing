import { Card } from "@/components/ui/card";

interface EventSponsorsProps {
    sponsors: string[];
}

export function EventSponsors({ sponsors }: EventSponsorsProps) {
    if (!sponsors || sponsors.length === 0) return null;

    return (
        <div className="space-y-4 my-8">
            <h2 className="text-2xl font-bold">Patrocinadores</h2>
            <div className="flex flex-wrap items-center gap-8 py-2">
                {sponsors.map((url, index) => (
                    <div key={index} className="h-12 md:h-20 grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100">
                        <img
                            src={url}
                            alt={`Patrocinador ${index + 1}`}
                            className="h-full w-auto object-contain"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
