// Desenho dos PDFs da montagem de kits: a lista de trabalho e as etiquetas.
//
// A geração de PDF deste projeto está copiada em cinco páginas (Registrations,
// StartOrderManager, SorteoPage, StartOrderConfig, OrganizerFinance). Aqui não
// vira a sexta cópia dentro da Secretaria: o padrão visual mora neste módulo e a
// página só chama. Os dados vêm prontos de shared/kits.ts.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { gradeDeEtiquetas, type DadosDeKits, type Kit, type FormatoEtiqueta, type GradeEtiquetas } from "@/shared/kits";

// ---------------------------------------------------------------- PDF (browser)

/** QR como matriz de módulos — desenhado em vetor, não em imagem. */
interface MatrizQr {
  size: number;
  data: Uint8Array | number[];
}

/** Desenha o QR com um retângulo por módulo preto. */
function desenharQr(doc: jsPDF, qr: MatrizQr, x: number, y: number, lado: number) {
  const passo = lado / qr.size;
  doc.setFillColor(0, 0, 0);
  for (let linha = 0; linha < qr.size; linha++) {
    let inicio = -1;
    // Junta módulos pretos vizinhos numa barra só: menos objetos no PDF e
    // sem a linha branca de antialiasing entre quadradinhos coladas.
    for (let coluna = 0; coluna <= qr.size; coluna++) {
      const preto = coluna < qr.size && !!qr.data[linha * qr.size + coluna];
      if (preto && inicio < 0) inicio = coluna;
      if (!preto && inicio >= 0) {
        doc.rect(x + inicio * passo, y + linha * passo, (coluna - inicio) * passo, passo, "F");
        inicio = -1;
      }
    }
  }
}

export interface LogosPdf {
  amigo: string | null;
  evento: string | null;
}

/** Logo da plataforma (public/logo-light.png) como data URL. */
export async function carregarLogoAmigo(): Promise<string | null> {
  try {
    const response = await fetch("/logo-light.png");
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Não foi possível carregar a logo da plataforma", e);
    return null;
  }
}

/** Cabeçalho padrão dos PDFs do site. Devolve o Y onde o corpo começa. */
function desenharCabecalho(doc: jsPDF, titulo: string, subtitulo: string, logos: LogosPdf): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  if (logos.amigo) {
    try { doc.addImage(logos.amigo, "PNG", pageWidth - 44, 10, 30, 0); }
    catch (e) { console.warn("Falha ao desenhar a logo da plataforma", e); }
  }
  if (logos.evento) {
    try {
      const props = doc.getImageProperties(logos.evento);
      const maxW = 45, maxH = 28;
      const ratio = Math.min(maxW / props.width, maxH / props.height);
      doc.addImage(logos.evento, (props as any).fileType || "PNG",
        14, 12 + (maxH - props.height * ratio) / 2, props.width * ratio, props.height * ratio);
    } catch (e) { console.warn("Falha ao desenhar o logo do evento", e); }
  }

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, pageWidth / 2, 28, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(subtitulo, pageWidth / 2, 36, { align: "center" });
  doc.setDrawColor(229, 231, 235);
  doc.line(14, 50, pageWidth - 14, 50);
  return 60;
}

/** PDF paisagem: o papel de trabalho da montagem, agrupado por categoria. */
export function gerarListaDeKitsPdf(dados: DadosDeKits, eventName: string, logos: LogosPdf): jsPDF {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let currentY = desenharCabecalho(doc, eventName, "Montagem de Kits", logos);

  const drawCategoryBanner = (label: string, baselineY: number) => {
    doc.setFillColor(249, 115, 22, 0.1);
    doc.rect(14, baselineY - 5, pageWidth - 28, 8, "F");
    doc.setTextColor(234, 88, 12);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(label, 17, baselineY);
  };
  const contBannerBaseline = 18;

  // Soma 269mm = A4 paisagem menos as margens de 14mm.
  const colunas = [
    { head: "Nº", cellWidth: 14, halign: "center" as const },
    { head: "Piloto", cellWidth: 46 },
    { head: "Telefone", cellWidth: 30, halign: "center" as const },
    { head: "Cam.", cellWidth: 16, halign: "center" as const },
    { head: "Navegador", cellWidth: 46 },
    { head: "Cam.", cellWidth: 16, halign: "center" as const },
    { head: "Extras da loja", cellWidth: 58 },
    { head: "Status", cellWidth: 25, halign: "center" as const },
    { head: "OK", cellWidth: 18, halign: "center" as const },
  ];
  const head = [colunas.map(c => c.head)];
  const columnStyles: any = {};
  colunas.forEach((c, i) => {
    columnStyles[i] = { cellWidth: c.cellWidth, ...(c.halign ? { halign: c.halign } : {}) };
  });
  const iStatus = colunas.findIndex(c => c.head === "Status");
  const iOk = colunas.length - 1;

  dados.grupos.forEach(({ categoria, kits }) => {
    const body = kits.map(k => [
      k.numero != null ? `#${k.numero}` : "-",
      k.pilotName,
      k.telefone || "-",
      k.camisaPiloto || "-",
      k.navigatorName || "-",
      k.camisaNavegador || "-",
      k.extras || "-",
      k.pago ? "Pago" : "PENDENTE",
      "",
    ]);

    const minBlock = 8 + 10 + 14 * Math.min(2, kits.length);
    if (currentY + minBlock > pageHeight - 14) {
      doc.addPage();
      currentY = 20;
    }
    const tableStartY = currentY;
    let firstTablePage = true;

    autoTable(doc, {
      startY: tableStartY + 5,
      head,
      body,
      theme: "striped",
      headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 10, fontStyle: "bold", halign: "center" },
      columnStyles,
      styles: { fontSize: 9, cellPadding: 3, valign: "middle" },
      rowPageBreak: "avoid",
      showHead: "everyPage",
      margin: { left: 14, right: 14, top: contBannerBaseline + 6 },
      didParseCell: (data) => {
        // Só o pendente chama atenção; o pago fica discreto pra não poluir.
        if (data.section === "body" && data.column.index === iStatus && data.cell.raw === "PENDENTE") {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawCell: (data) => {
        // Quadradinho vazio pra riscar à mão conforme monta o kit.
        if (data.section === "body" && data.column.index === iOk) {
          const lado = 5;
          doc.setDrawColor(120, 120, 120);
          doc.setLineWidth(0.3);
          doc.rect(
            data.cell.x + (data.cell.width - lado) / 2,
            data.cell.y + (data.cell.height - lado) / 2,
            lado, lado,
          );
        }
      },
      didDrawPage: () => {
        if (firstTablePage) {
          drawCategoryBanner(categoria, tableStartY);
          firstTablePage = false;
        } else {
          drawCategoryBanner(`${categoria} (continuação)`, contBannerBaseline);
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 12;
  });

  desenharResumo(doc, dados, currentY, pageWidth, pageHeight);
  return doc;
}

/** O número que a montagem confere contra a caixa da estamparia. */
function desenharResumo(doc: jsPDF, dados: DadosDeKits, y: number, pageWidth: number, pageHeight: number) {
  const alturaResumo = 14 + 18 + 12;
  let currentY = y;
  if (currentY + alturaResumo > pageHeight - 14) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(31, 41, 55);
  doc.rect(14, currentY - 5, pageWidth - 28, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO — CONFERÊNCIA DAS CAMISETAS", 17, currentY);

  autoTable(doc, {
    startY: currentY + 5,
    head: [dados.totaisPorTamanho.map(t => t.size)],
    body: [dados.totaisPorTamanho.map(t => String(t.total))],
    theme: "grid",
    headStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: "bold", halign: "center", fontSize: 11 },
    styles: { fontSize: 13, cellPadding: 4, halign: "center", fontStyle: "bold", valign: "middle" },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${dados.totalKits} kits · ${dados.totalCamisetas} camisetas no total` +
    (dados.totalPendentes ? ` · ${dados.totalPendentes} de inscrição PENDENTE` : ""),
    14, finalY,
  );
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")} - Amigo Racing Platform`,
    14, pageHeight - 10,
  );
}

/**
 * Uma etiqueta por kit, em grade na A4. O QR carrega o accessHash — o mesmo
 * conteúdo do passaporte, então bipar a etiqueta na entrega funciona no leitor
 * que já existe.
 */
export async function gerarEtiquetasPdf(
  dados: DadosDeKits,
  eventName: string,
  logoEvento: string | null,
  formato: FormatoEtiqueta,
): Promise<jsPDF> {
  const grade = gradeDeEtiquetas(formato);
  const grande = formato === "10x15";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Escala do desenho: o compacto é a mesma etiqueta com logo, número e QR menores.
  const s = {
    logoH: grande ? 26 : 10,
    numero: grande ? 72 : 30,
    piloto: grande ? 17 : 10.5,
    nav: grande ? 11.5 : 8,
    camisa: grande ? 20 : 11,
    rodape: grande ? 9.5 : 7,
    qr: grande ? 32 : 16,
    pad: grande ? 7 : 4.5,
  };

  // QR em VETOR, não em PNG: o jsPDF expande PNG para RGBA cru, e 37 QRs viravam
  // um PDF de 6 MB. Desenhado com rect fica em alguns kB e sai nítido em
  // qualquer DPI da impressora. Level 'M' basta (o passaporte usa 'H', mais
  // denso do que precisa pra um hash lido de perto).
  const qrs = new Map<number, MatrizQr>();
  for (const kit of dados.kits) {
    if (!kit.accessHash) continue;
    try {
      const qr = QRCode.create(kit.accessHash, { errorCorrectionLevel: "M" });
      qrs.set(kit.id, { size: qr.modules.size, data: qr.modules.data });
    } catch (e) {
      console.warn(`Falha ao gerar QR da inscrição ${kit.id}`, e);
    }
  }

  dados.kits.forEach((kit, i) => {
    const indiceNaFolha = i % grade.porFolha;
    if (i > 0 && indiceNaFolha === 0) doc.addPage();

    const col = indiceNaFolha % grade.colunas;
    const lin = Math.floor(indiceNaFolha / grade.colunas);
    const x = grade.margemX + col * grade.larguraMm;
    const y = grade.margemY + lin * grade.alturaMm;
    desenharEtiqueta(doc, kit, eventName, logoEvento, qrs.get(kit.id) || null, x, y, grade, s, grande);
  });

  return doc;
}

function desenharEtiqueta(
  doc: jsPDF,
  kit: Kit,
  eventName: string,
  logoEvento: string | null,
  qr: MatrizQr | null,
  x: number,
  y: number,
  grade: GradeEtiquetas,
  s: any,
  grande: boolean,
) {
  const w = grade.larguraMm;
  const h = grade.alturaMm;
  const pad = s.pad;
  const centro = x + w / 2;

  // Borda tracejada = linha de corte.
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(x + 1, y + 1, w - 2, h - 2);
  doc.setLineDashPattern([], 0);

  let cursor = y + pad;

  // Logo do evento (ou o nome, quando o evento não tem logo).
  if (logoEvento) {
    try {
      const props = doc.getImageProperties(logoEvento);
      const maxW = w - 2 * pad - 4;
      const ratio = Math.min(maxW / props.width, s.logoH / props.height);
      const lw = props.width * ratio;
      const lh = props.height * ratio;
      // O `alias` faz o jsPDF embutir a logo UMA vez e referenciar nas demais
      // etiquetas. Sem ele, um logo de 800 kB vira um PDF de 7 MB com 37 kits.
      doc.addImage(logoEvento, (props as any).fileType || "PNG", centro - lw / 2, cursor, lw, lh, "logo-evento");
      cursor += lh + (grande ? 4 : 2);
    } catch {
      cursor += 2;
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(grande ? 11 : 8);
    doc.setTextColor(107, 114, 128);
    doc.text(eventName.toUpperCase(), centro, cursor + 4, { align: "center", maxWidth: w - 2 * pad });
    cursor += grande ? 8 : 6;
  }

  // Número de largada: o dominante da etiqueta, legível de longe.
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(s.numero);
  doc.text(kit.numero != null ? String(kit.numero) : "—", centro, cursor + s.numero * 0.32, { align: "center" });
  cursor += s.numero * 0.42 + (grande ? 4 : 2);

  // Nomes. splitTextToSize é obrigatório aqui: com maxWidth o jsPDF quebra a
  // linha mas NÃO avisa quantas linhas saíram, e nome comprido ("JOAO ROBERTO
  // THOME DE SOUZA") passava por cima da linha do navegador.
  const larguraUtil = w - 2 * pad;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(s.piloto);
  let linhasPiloto = doc.splitTextToSize(kit.pilotName.toUpperCase(), larguraUtil) as string[];
  // 3+ linhas comem a etiqueta: diminui a fonte até caber em 2.
  let fontePiloto = s.piloto;
  while (linhasPiloto.length > 2 && fontePiloto > s.piloto * 0.7) {
    fontePiloto -= 0.5;
    doc.setFontSize(fontePiloto);
    linhasPiloto = doc.splitTextToSize(kit.pilotName.toUpperCase(), larguraUtil) as string[];
  }
  const alturaLinhaPiloto = fontePiloto * 0.42;
  cursor += alturaLinhaPiloto;
  doc.text(linhasPiloto, x + pad, cursor);
  cursor += alturaLinhaPiloto * (linhasPiloto.length - 1) + 1;

  if (kit.navigatorName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(s.nav);
    doc.setTextColor(75, 85, 99);
    const linhasNav = doc.splitTextToSize(`Nav: ${kit.navigatorName}`, larguraUtil) as string[];
    const alturaLinhaNav = s.nav * 0.42;
    cursor += alturaLinhaNav;
    doc.text(linhasNav.slice(0, 2), x + pad, cursor);
    cursor += alturaLinhaNav * (Math.min(linhasNav.length, 2) - 1);
  }

  // Faixa das camisetas — o que quem monta o kit precisa ver primeiro.
  const faixaH = grande ? (kit.extrasTamanhos.length ? 25 : 17) : (kit.extrasTamanhos.length ? 13 : 9.5);
  cursor += grande ? 4 : 2;
  doc.setFillColor(243, 244, 246);
  doc.rect(x + pad, cursor, larguraUtil, faixaH, "F");
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(s.camisa);
  const camisas = [
    `PILOTO ${kit.camisaPiloto || "-"}`,
    kit.camisaNavegador ? `NAV ${kit.camisaNavegador}` : "",
  ].filter(Boolean).join("   ·   ");
  doc.text(camisas, centro, cursor + (grande ? 11.5 : 6.5), { align: "center", maxWidth: larguraUtil - 2 });
  if (kit.extrasTamanhos.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(grande ? 9.5 : 7);
    doc.setTextColor(75, 85, 99);
    doc.text(
      `+ ${kit.extrasTamanhos.length} da loja (${kit.extrasTamanhos.join(", ")})`,
      centro, cursor + (grande ? 20 : 11),
      { align: "center", maxWidth: larguraUtil - 2 },
    );
  }
  cursor += faixaH + (grande ? 6 : 3);

  // Categoria e horário, logo abaixo da faixa e na largura toda.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(s.rodape);
  doc.setTextColor(107, 114, 128);
  const linhaInfo = [kit.categoriaNome, kit.horario ? `larga ${kit.horario}` : ""].filter(Boolean).join(" · ");
  doc.text(doc.splitTextToSize(linhaInfo, larguraUtil).slice(0, 2), x + pad, cursor);

  // QR + número da inscrição, ancorados no rodapé da etiqueta.
  const qrX = x + w - pad - s.qr;
  const qrY = y + h - pad - s.qr;
  if (qr) desenharQr(doc, qr, qrX, qrY, s.qr);
  doc.setFontSize(s.rodape);
  doc.setTextColor(107, 114, 128);
  doc.text(`Inscrição #${kit.id}`, x + pad, y + h - pad - 1);

  // Selo do pendente: ninguém entrega kit de inscrição em aberto sem perceber.
  if (!kit.pago) {
    doc.setTextColor(220, 38, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(grande ? 26 : 13);
    // Na faixa livre abaixo dos dados: chama atenção sem cobrir o número nem os
    // tamanhos de camiseta, que é o que a montagem precisa ler.
    doc.text("PENDENTE", x + w * (grande ? 0.5 : 0.32), y + h * (grande ? 0.82 : 0.93), { align: "center", angle: 12 });
  }
}

export function nomeDeArquivo(prefixo: string, eventName: string): string {
  return `${prefixo}_${eventName.replace(/\s+/g, "_").toLowerCase()}.pdf`;
}
