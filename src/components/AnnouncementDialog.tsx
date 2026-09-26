import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

interface Announcement {
  id: number;
  titulo: string;
  conteudo: string;
}

export function AnnouncementDialog() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    const { data } = await supabase
      .from("informacoes_aplicativo")
      .select("id, titulo, conteudo")
      .eq("categoria", "avisos")
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (data && data.length > 0) {
      setAnnouncements(data);
      setOpen(true);
    }
  };

  const handleNext = () => {
    if (currentIndex < announcements.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setOpen(false);
      setCurrentIndex(0);
    }
  };

  const currentAnnouncement = announcements[currentIndex];

  if (!currentAnnouncement) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="text-lg">{currentAnnouncement.titulo}</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed whitespace-pre-wrap">
            {currentAnnouncement.conteudo}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mt-4">
          {announcements.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {currentIndex + 1} de {announcements.length}
            </p>
          )}
          <Button
            onClick={handleNext}
            className="ml-auto"
          >
            {currentIndex < announcements.length - 1 ? "Próximo" : "Entendi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
