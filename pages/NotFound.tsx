import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Home } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <Card className="w-full max-w-md mx-4">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold text-center">404 - Página não encontrada</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-muted-foreground">
                        A página que você está procurando não existe ou foi movida.
                    </p>
                </CardContent>
                <CardFooter className="flex justify-center">
                    <Link href="/">
                        <Button variant="default">
                            <Home className="mr-2 h-4 w-4" />
                            Voltar ao Início
                        </Button>
                    </Link>
                </CardFooter>
            </Card>
        </div>
    );
}
