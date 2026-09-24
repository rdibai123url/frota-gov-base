import { Info } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getHelpTopic, type FieldTag, type HelpTopic } from "@/lib/ajuda";
import { cn } from "@/lib/utils";

const TAG_STYLE: Record<FieldTag, string> = {
  Obrigatório: "border-primary/30 bg-primary/10 text-primary",
  Automático: "border-border bg-muted text-muted-foreground",
  Calculado: "border-border bg-muted text-muted-foreground",
  Condicional: "border-border bg-muted text-muted-foreground",
  "Depende de integração": "border-warning/40 bg-warning/15 text-foreground",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="gov-title text-[13px] uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function HelpContent({ topic }: { topic: HelpTopic }) {
  return (
    <div className="space-y-6 pb-8 text-sm leading-relaxed">
      <Section title="Para que serve">
        <p className="text-foreground">{topic.purpose}</p>
      </Section>

      <Section title="Como usar">
        <ol className="space-y-2">
          {topic.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {topic.fields && topic.fields.length > 0 && (
        <Section title="Campos e informações da tela">
          <ul className="divide-y rounded-lg border">
            {topic.fields.map((field) => (
              <li key={field.label} className="space-y-1.5 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{field.label}</span>
                  {field.tags?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={cn(
                        "rounded-full px-2 py-0 text-[10px] font-medium",
                        TAG_STYLE[tag],
                      )}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="text-muted-foreground">{field.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {topic.rules && topic.rules.length > 0 && (
        <Section title="Regras importantes">
          <ul className="space-y-2">
            {topic.rules.map((rule) => (
              <li key={rule} className="flex gap-2.5 rounded-md bg-muted/70 px-3 py-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0">{rule}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {topic.examples && topic.examples.length > 0 && (
        <Section title="Exemplos">
          <ul className="space-y-2">
            {topic.examples.map((ex) => (
              <li
                key={ex}
                className="rounded-md border-l-2 border-primary/60 bg-accent/60 px-3 py-2 text-accent-foreground"
              >
                {ex}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/**
 * Botão "i" de ajuda contextual. Busca o conteúdo da rota atual no registro
 * central de ajuda; quando `topicKey` é informado (abas internas), usa essa chave.
 */
export function HelpButton({ pathname, topicKey }: { pathname: string; topicKey?: string }) {
  const [open, setOpen] = useState(false);
  const topic = getHelpTopic(topicKey ?? pathname);
  if (!topic) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Ajuda sobre ${topic.title}`}
            className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Ajuda desta tela</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md"
        >
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="gov-title flex items-center gap-2 text-lg">
              <Info className="size-4 text-primary" />
              {topic.title}
            </SheetTitle>
            <SheetDescription>Ajuda desta tela do FrotaGov</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <HelpContent topic={topic} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function HelpInlineButton({ topicKey }: { topicKey: string }) {
  return <HelpButton pathname={topicKey} topicKey={topicKey} />;
}
