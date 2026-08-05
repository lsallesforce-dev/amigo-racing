// PDF da classificação do campeonato — UM módulo, dois consumidores.
//
// Este código estava duplicado quase verbatim em pages/ChampionshipDetails.tsx
// (painel do organizador) e pages/ChampionshipShowcase.tsx (vitrine pública):
// ~150 linhas iguais em cada, que já tinham divergido em detalhes (a vitrine
// perdeu ajustes que o painel ganhou). Aqui o desenho mora num lugar só e as
// duas páginas passam a chamar `gerarPdfClassificacao`.
//
// Três correções que vieram junto com a extração:
//
//  1. O A4 RETRATO não cabe o formato do regulamento (15 provas): as colunas de
//     etapa espremiam a ponto de o nome do competidor sumir. Acima de 8 etapas o
//     documento vira paisagem sozinho.
//  2. Quem não largou aparecia como "0", igual a quem correu e não pontuou. DNS
//     agora é "–" e DSQ é "NC" — coisas diferentes, marcas diferentes.
//  3. A coluna "Pos" era o índice do array (1, 2, 3, 4...). Agora é o `posicao`
//     que vem do backend, onde empate de verdade REPETE a colocação (1, 1, 3).

import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type RowInput } from "jspdf-autotable";
import type { CategoriaClassificacao, CompetidorClassificado, ResultadoEtapa } from "@/shared/classificacaoCampeonato";

/** A etapa como o PDF precisa dela: número para o cabeçalho e nome para o rótulo. */
export interface EtapaPdf {
  id: number;
  stageNumber: number;
  nome: string;
}

export interface DadosPdfCampeonato {
  championship: {
    name: string;
    year: number;
    discardRule: number;
    imageUrl?: string | null;
    sponsorBannerUrl?: string | null;
  };
  categorias: CategoriaClassificacao[];
  etapas: EtapaPdf[];
}

/** Acima disto o A4 retrato não sustenta mais uma coluna por etapa. */
const LIMITE_ETAPAS_RETRATO = 8;
/** Altura máxima do banner de patrocinadores, em mm. Segura o rodapé no lugar. */
const ALTURA_MAX_BANNER = 16;

const MARGEM = 14;
const CINZA_TEXTO: [number, number, number] = [150, 150, 150];
const VERMELHO: [number, number, number] = [200, 40, 40];

/**
 * Imagem remota vira data URI antes de entrar no PDF. O jsPDF não busca URL
 * sozinho, e o fetch direto de outro domínio quebra por CORS — por isso a
 * conversão acontece aqui e o erro nunca derruba a geração.
 */
async function urlParaBase64(url: string): Promise<string> {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  try {
    const resposta = await fetch(url);
    const blob = await resposta.blob();
    return await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onloadend = () => resolve(leitor.result as string);
      leitor.onerror = reject;
      leitor.readAsDataURL(blob);
    });
  } catch (erro) {
    console.error("PDF do campeonato: não consegui converter a imagem", url, erro);
    return "";
  }
}

/** Nome de etapa no cabeçalho da coluna: cabe pouco, então corta com reticências. */
function abreviar(nome: string, limite: number): string {
  const limpo = (nome || "").trim();
  if (limpo.length <= limite) return limpo;
  return limpo.slice(0, Math.max(1, limite - 2)) + "..";
}

/**
 * Uma célula de etapa. É aqui que DNS deixa de parecer com DSQ e o descartado
 * deixa de parecer com o que conta: descartado sai entre parênteses, em
 * vermelho itálico (a legenda do rodapé explica).
 */
function celulaDaEtapa(res: ResultadoEtapa | undefined): CellDef {
  if (!res || res.isDns) return { content: "–", styles: { textColor: CINZA_TEXTO } };
  if (res.isDisqualified) return { content: "NC", styles: { textColor: VERMELHO, fontStyle: "bold" } };
  if (res.isDiscarded) {
    return { content: `(${res.points})`, styles: { textColor: VERMELHO, fontStyle: "bolditalic" } };
  }
  return { content: String(res.points) };
}

/**
 * Gera e baixa o PDF da classificação (uma página por categoria, pilotos e
 * navegadores em tabelas separadas). Faz o `doc.save()` internamente — quem
 * chama só precisa dos dados.
 */
export async function gerarPdfClassificacao(dados: DadosPdfCampeonato): Promise<void> {
  const categorias = (dados.categorias || []).filter(Boolean);
  if (categorias.length === 0) return;

  const etapas = [...(dados.etapas || [])].sort(
    (a, b) => a.stageNumber - b.stageNumber || a.id - b.id,
  );

  // Muita etapa = paisagem. Sem isto o formato de 15 provas do regulamento
  // estoura a largura e o PDF sai ilegível.
  const paisagem = etapas.length > LIMITE_ETAPAS_RETRATO;
  const doc = new jsPDF(paisagem ? "l" : "p", "mm", "a4");
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraUtil = larguraPagina - MARGEM * 2;

  // As imagens são resolvidas UMA vez, antes do loop — cada página só reusa.
  const logoCampeonato = dados.championship.imageUrl ? await urlParaBase64(dados.championship.imageUrl) : "";
  const bannerPatrocinio = dados.championship.sponsorBannerUrl
    ? await urlParaBase64(dados.championship.sponsorBannerUrl)
    : "";
  const logoAmigo = await urlParaBase64("/logo-light.png");

  // O banner tem altura variável; sem medir, ou ele invade a tabela ou sobra um
  // rodapé gigante. Aqui a caixa dele é calculada de verdade a partir do arquivo.
  let bannerLargura = 0;
  let bannerAltura = 0;
  if (bannerPatrocinio) {
    try {
      const prop = doc.getImageProperties(bannerPatrocinio);
      const escala = Math.min(larguraUtil / prop.width, ALTURA_MAX_BANNER / prop.height);
      bannerLargura = prop.width * escala;
      bannerAltura = prop.height * escala;
    } catch (erro) {
      console.error("PDF do campeonato: banner de patrocínio inválido", erro);
    }
  }

  const alturaRodape = (bannerAltura > 0 ? bannerAltura + 6 : 0) + 10;
  const topoTabela = 45;

  // Uma página só recebe cabeçalho/rodapé uma vez: as DUAS tabelas (pilotos e
  // navegadores) chamam o mesmo desenhador, e sem esta trava o texto sairia
  // sobreposto a si mesmo (efeito "borrado").
  const paginasDesenhadas = new Set<number>();

  const desenharMoldura = (nomeCategoria: string) => {
    const pagina = doc.getCurrentPageInfo().pageNumber;
    if (paginasDesenhadas.has(pagina)) return;
    paginasDesenhadas.add(pagina);

    // --- cabeçalho: logo do campeonato à esquerda ---
    if (logoCampeonato) {
      try {
        doc.addImage(logoCampeonato, "JPEG", MARGEM, 10, 25, 0, undefined, "FAST");
      } catch (erro) {
        console.error("PDF do campeonato: logo inválida", erro);
      }
    } else {
      doc.setDrawColor(200);
      doc.rect(MARGEM, 10, 25, 25);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text("COPA", MARGEM + 12.5, 23, { align: "center" });
    }

    // --- cabeçalho: título ao centro ---
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(dados.championship.name || "Campeonato", larguraPagina / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Classificação Geral Oficial ${dados.championship.year} - ${nomeCategoria}`,
      larguraPagina / 2,
      27,
      { align: "center" },
    );

    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text("www.amigoracing.com.br", larguraPagina / 2, 33, { align: "center" });

    // --- cabeçalho: marca da plataforma à direita ---
    if (logoAmigo) {
      try {
        doc.addImage(logoAmigo, "PNG", larguraPagina - MARGEM - 32, 12, 32, 0);
      } catch {
        doc.setFontSize(10);
        doc.text("AMIGO RACING", larguraPagina - MARGEM - 32, 20);
      }
    }

    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.5);
    doc.line(MARGEM, 38, larguraPagina - MARGEM, 38);

    // --- rodapé: legenda, paginação e banner ---
    const yLegenda = alturaPagina - (bannerAltura > 0 ? bannerAltura + 9 : 5);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...VERMELHO);
    const legenda =
      dados.championship.discardRule > 0
        ? "(  ) resultado descartado pelo regulamento    NC = não classificado/desclassificado    – = não largou"
        : "NC = não classificado/desclassificado    – = não largou";
    doc.text(legenda, MARGEM, yLegenda);

    doc.setTextColor(100);
    doc.text(`Página ${pagina}`, larguraPagina - MARGEM, yLegenda, { align: "right" });

    if (bannerPatrocinio && bannerAltura > 0) {
      try {
        doc.addImage(
          bannerPatrocinio,
          "JPEG",
          MARGEM + (larguraUtil - bannerLargura) / 2,
          alturaPagina - 6 - bannerAltura,
          bannerLargura,
          bannerAltura,
        );
      } catch (erro) {
        console.error("PDF do campeonato: não consegui desenhar o banner", erro);
      }
    }
  };

  const larguraNome = paisagem ? 46 : 40;
  const limiteAbreviacao = paisagem ? 14 : 10;
  const fonteCorpo = etapas.length > 12 ? 6.5 : etapas.length > 8 ? 7 : 8;

  categorias.forEach((categoria, indiceCategoria) => {
    if (indiceCategoria > 0) doc.addPage();
    desenharMoldura(categoria.name);

    let y = topoTabela;

    const papeis: { chave: "pilots" | "navigators"; rotulo: string }[] = [
      { chave: "pilots", rotulo: "PILOTOS" },
      { chave: "navigators", rotulo: "NAVEGADORES" },
    ];

    papeis.forEach(papel => {
      const lista: CompetidorClassificado[] = categoria[papel.chave] || [];
      if (lista.length === 0) return;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(papel.rotulo, MARGEM, y);
      y += 5;

      const cabecalho: RowInput[] = [
        [
          "Pos",
          "Competidor",
          ...etapas.map(e => `E${e.stageNumber}\n(${abreviar(e.nome, limiteAbreviacao)})`),
          "Bruto",
          "Total",
        ],
      ];

      const corpo: RowInput[] = lista.map(comp => {
        const porEtapa = new Map(comp.stageResults.map(sr => [sr.stageId, sr]));
        return [
          // `posicao` vem pronto do backend: empate real repete o número.
          { content: `${comp.posicao}º`, styles: { fontStyle: "bold" } } as CellDef,
          { content: comp.name, styles: { halign: "left" } } as CellDef,
          ...etapas.map(e => celulaDaEtapa(porEtapa.get(e.id))),
          { content: String(comp.grossPoints), styles: { textColor: [120, 120, 120] } } as CellDef,
          { content: String(comp.netPoints), styles: { fontStyle: "bold" } } as CellDef,
        ];
      });

      autoTable(doc, {
        startY: y,
        head: cabecalho,
        body: corpo,
        margin: { left: MARGEM, right: MARGEM, top: topoTabela, bottom: alturaRodape },
        styles: { fontSize: fonteCorpo, cellPadding: 1.5, halign: "center", overflow: "ellipsize" },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { halign: "left", cellWidth: larguraNome },
        },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: Math.max(5.5, fonteCorpo - 1) },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        // Pódio destacado também no papel — no PDF a régua é a colocação, não a
        // ordem da linha (que empata).
        didParseCell: data => {
          if (data.section !== "body") return;
          const comp = lista[data.row.index];
          if (comp && comp.posicao <= 3) data.cell.styles.fillColor = [255, 246, 224];
        },
        didDrawPage: () => desenharMoldura(categoria.name),
      });

      y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
    });
  });

  const arquivo = `Classificacao_${(dados.championship.name || "Campeonato").replace(/[\\/:*?"<>|]+/g, "-")}_${dados.championship.year}.pdf`;
  doc.save(arquivo);
}
