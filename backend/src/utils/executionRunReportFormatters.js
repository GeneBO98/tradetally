const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const FOOTER_Y = 34;
const REPORT_TEMPLATE_LABELS = {
  trader: 'Trader Workbook',
  prop_firm: 'Prop Firm Risk Review',
  investor: 'Investor Summary',
  tax_accounting: 'Tax and Accounting Packet'
};

function reportToCsv(report) {
  const rows = [
    ['section', 'key', 'value'],
    ['run', 'id', report.run.id],
    ['run', 'mode', report.run.mode],
    ['run', 'status', report.run.status],
    ['run', 'source', report.run.source || ''],
    ['run', 'parentRunId', report.run.parentRunId || ''],
    ['run', 'lineageType', report.run.lineageType || ''],
    ['run', 'marketDataSnapshotId', report.run.marketDataSnapshotId || ''],
    ['run', 'startedAt', report.run.startedAt || ''],
    ['run', 'endedAt', report.run.endedAt || ''],
    ...Object.entries(report.run.metrics || {}).map(([key, value]) => ['metric', key, value]),
    ...Object.entries(report.run.confidence || {}).map(([key, value]) => ['confidence', key, JSON.stringify(value)]),
    ...report.events.map(event => ['event', event.eventType, JSON.stringify(event.payload || {})])
  ];

  return rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function pdfEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pdfDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return pdfDate(new Date());
  const pad = number => String(number).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function pdfUnescape(value) {
  return String(value || '')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function splitText(value, maxChars) {
  const text = formatValue(value);
  if (text.length <= maxChars) return [text];

  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current.length + word.length + 1) <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.flatMap(line => {
    if (line.length <= maxChars) return [line];
    const chunks = [];
    for (let index = 0; index < line.length; index += maxChars) {
      chunks.push(line.slice(index, index + maxChars));
    }
    return chunks;
  });
}

class PaginatedReportDocument {
  constructor(title, options = {}) {
    this.title = title;
    this.watermarkText = options.watermarkText || null;
    this.generatedAt = options.generatedAt || new Date().toISOString();
    this.metadata = {
      documentTitle: options.documentTitle || title,
      author: options.author || 'TradeTally',
      subject: options.subject || 'Execution run analytics report',
      keywords: options.keywords || 'trading,analytics,execution run,report',
      language: options.language || 'en-US'
    };
    this.pages = [];
    this.snapshotPages = [];
    this.sectionIndex = [];
    this.pageMarkedContent = [];
    this.semanticTables = [];
    this.finished = false;
    this.newPage();
  }

  newPage() {
    this.pages.push([]);
    this.snapshotPages.push([]);
    this.pageMarkedContent.push([]);
    this.y = PAGE_HEIGHT - MARGIN;
    this.header();
  }

  header() {
    const pageNumber = this.pages.length;
    this.raw(`BT /F2 10 Tf ${MARGIN} ${this.y} Td (${pdfEscape(this.title)}) Tj ET`, false);
    this.raw(`BT /F1 8 Tf ${PAGE_WIDTH - MARGIN - 150} ${this.y} Td (${pdfEscape(this.generatedAt)}) Tj ET`, false);
    this.y -= 12;
    this.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, false);
    this.currentSnapshot().push(`Header: ${this.title} page ${pageNumber}`);
    this.y -= 18;
  }

  currentPage() {
    return this.pages[this.pages.length - 1];
  }

  currentSnapshot() {
    return this.snapshotPages[this.snapshotPages.length - 1];
  }

  ensureSpace(lineHeight = 14) {
    if ((this.y - lineHeight) < (MARGIN + 16)) {
      this.newPage();
    }
  }

  ensureBlock(height = 18) {
    if ((this.y - height) < (MARGIN + 16)) {
      this.newPage();
    }
  }

  raw(operation, snapshot = true) {
    this.currentPage().push(operation);
    if (snapshot && typeof snapshot === 'string') this.currentSnapshot().push(snapshot);
  }

  line(x1, y1, x2, y2, snapshot = false) {
    this.currentPage().push(`q 0.78 0.78 0.78 RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S Q`);
    if (snapshot) this.currentSnapshot().push('--- divider ---');
  }

  shade(x, y, width, height) {
    this.currentPage().push(`q 0.95 0.95 0.95 rg ${x} ${y} ${width} ${height} re f Q`);
  }

  text(value, options = {}) {
    const fontSize = options.fontSize || 10;
    const lineHeight = options.lineHeight || Math.max(12, fontSize + 4);
    const font = options.font || 'F1';
    const indent = options.indent || 0;
    const x = options.x || (MARGIN + indent);
    const width = options.width || (PAGE_WIDTH - (MARGIN * 2) - indent);
    const maxChars = Math.max(18, Math.floor(width / (fontSize * 0.52)));
    const lines = splitText(value, maxChars);

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.currentPage().push(`BT /${font} ${fontSize} Tf ${x} ${this.y} Td (${pdfEscape(line)}) Tj ET`);
      if (options.snapshot !== false) {
        this.currentSnapshot().push(line);
      }
      this.y -= lineHeight;
    }
  }

  textLine(value, options = {}) {
    const fontSize = options.fontSize || 10;
    const font = options.font || 'F1';
    const x = options.x || MARGIN;
    const y = options.y ?? this.y;
    const text = formatValue(value);
    if (options.tag) {
      const pageIndex = this.pages.length - 1;
      const mcid = this.pageMarkedContent[pageIndex].length;
      const mark = { pageIndex, mcid, tag: options.tag, text };
      this.pageMarkedContent[pageIndex].push(mark);
      this.currentPage().push(`/${options.tag} << /MCID ${mcid} >> BDC BT /${font} ${fontSize} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET EMC`);
      return mark;
    }
    this.currentPage().push(`BT /${font} ${fontSize} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`);
    return null;
  }

  paragraph(value) {
    this.text(value, { fontSize: 9.2, lineHeight: 12.5 });
  }

  titleText(value, subtitle) {
    this.ensureBlock(54);
    this.text(value, { font: 'F2', fontSize: 20, lineHeight: 24 });
    if (subtitle) this.text(subtitle, { fontSize: 10, lineHeight: 14 });
    this.y -= 8;
  }

  reportIndex(items = []) {
    const enabledItems = items.filter(Boolean);
    if (enabledItems.length === 0) return;
    this.section('Report Index');
    const columnWidth = (PAGE_WIDTH - (MARGIN * 2) - 18) / 2;
    enabledItems.forEach((item, index) => {
      if (index % 2 === 0) this.ensureBlock(18);
      const x = MARGIN + ((index % 2) * (columnWidth + 18));
      const y = this.y;
      this.shade(x, y - 11, columnWidth, 15);
      this.textLine(item, { font: 'F2', fontSize: 8.6, x: x + 6, y: y - 1 });
      this.currentSnapshot().push(`Index: ${item}`);
      if (index % 2 === 1) this.y -= 18;
    });
    if (enabledItems.length % 2 === 1) this.y -= 18;
    this.y -= 4;
  }

  section(value) {
    this.ensureBlock(38);
    this.sectionIndex.push({ title: value, page: this.pages.length });
    this.y -= 2;
    this.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, true);
    this.y -= 16;
    this.text(value, { font: 'F2', fontSize: 13, lineHeight: 18 });
  }

  keyValues(rows) {
    const normalizedRows = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (normalizedRows.length === 0) {
      this.text('No data', { fontSize: 9.5, lineHeight: 13 });
      return;
    }
    normalizedRows.forEach(([key, value], index) => {
      this.ensureBlock(16);
      const rowY = this.y + 3;
      if (index % 2 === 0) this.shade(MARGIN, rowY - 12, PAGE_WIDTH - (MARGIN * 2), 15);
      this.text(key, { font: 'F2', fontSize: 8.5, lineHeight: 0.1, x: MARGIN + 6, width: 130, snapshot: false });
      this.text(formatValue(value), { fontSize: 8.8, lineHeight: 13, x: MARGIN + 145, width: PAGE_WIDTH - (MARGIN * 2) - 150 });
      this.y -= 3;
    });
  }

  entries(title, object = {}) {
    const entries = Object.entries(object || {});
    this.section(title);
    if (entries.length === 0) {
      this.text('No data', { fontSize: 9.5, lineHeight: 13 });
      return;
    }
    entries.forEach(([key, value]) => {
      this.text(`${key}: ${formatValue(value)}`, { fontSize: 9.5, lineHeight: 13 });
    });
  }

  table(title, headers = [], rows = []) {
    this.section(title);
    if (!rows.length) {
      this.text('No rows included', { fontSize: 9.5, lineHeight: 13 });
      return;
    }
    const semanticTable = {
      title,
      headers: [],
      rows: []
    };
    this.semanticTables.push(semanticTable);
    const availableWidth = PAGE_WIDTH - (MARGIN * 2);
    const columnWidth = availableWidth / Math.max(headers.length, 1);
    const renderHeader = () => {
      this.ensureBlock(22);
      this.shade(MARGIN, this.y - 10, availableWidth, 17);
      const headerMarks = [];
      headers.forEach((header, index) => {
        const mark = this.textLine(header, {
          font: 'F2',
          fontSize: 8,
          x: MARGIN + (index * columnWidth) + 4,
          y: this.y - 1,
          tag: 'TH'
        });
        headerMarks.push({ text: formatValue(header), marks: [mark].filter(Boolean) });
      });
      semanticTable.headers.push(headerMarks);
      this.currentSnapshot().push(headers.join(' | '));
      this.y -= 19;
    };
    renderHeader();
    rows.forEach((row, rowIndex) => {
      const cells = row.map((cell) => {
        const maxChars = Math.max(10, Math.floor((columnWidth - 8) / (7.8 * 0.52)));
        return splitText(formatValue(cell), maxChars).slice(0, 6);
      });
      const rowHeight = Math.max(18, Math.max(...cells.map(lines => lines.length)) * 10 + 8);
      const beforePageCount = this.pages.length;
      this.ensureBlock(rowHeight + 4);
      if (this.pages.length !== beforePageCount) renderHeader();
      if (rowIndex % 2 === 0) this.shade(MARGIN, this.y - rowHeight + 5, availableWidth, rowHeight);
      const semanticRow = [];
      cells.forEach((lines, index) => {
        const marks = [];
        lines.forEach((line, lineIndex) => {
          const mark = this.textLine(line, {
            fontSize: 7.8,
            x: MARGIN + (index * columnWidth) + 4,
            y: this.y - (lineIndex * 10),
            tag: 'TD'
          });
          if (mark) marks.push(mark);
        });
        semanticRow.push({ text: formatValue(row[index]), marks });
      });
      semanticTable.rows.push(semanticRow);
      this.currentSnapshot().push(row.map(formatValue).join(' | '));
      this.y -= rowHeight;
    });
  }

  eventList(events = []) {
    this.table(
      'Event Timeline',
      ['Time', 'Event', 'Payload'],
      events.map(event => [
        event.createdAt || '-',
        event.eventType || '-',
        formatValue(event.payload || {})
      ])
    );
  }

  accessList(accesses = []) {
    this.table(
      'Report Access Audit',
      ['Time', 'Access', 'IP', 'Request'],
      accesses.map(access => [
        access.createdAt || '-',
        `${access.accessType || '-'}/${access.format || '-'}`,
        access.ipAddress || '-',
        access.requestId || '-'
      ])
    );
  }

  shareAuditList(audits = []) {
    this.table(
      'Share Link Audit',
      ['Time', 'Action', 'Recipient', 'Token Hash'],
      audits.map(audit => [
        audit.createdAt || '-',
        audit.action || '-',
        audit.recipient || '-',
        audit.tokenHash || audit.previousTokenHash || '-'
      ])
    );
  }

  finish() {
    if (this.finished) return;
    const totalPages = this.pages.length;
    this.pages.forEach((page, index) => {
      if (this.watermarkText) {
        page.unshift(`q 0.86 0.86 0.86 rg BT /F2 28 Tf 145 405 Td (${pdfEscape(this.watermarkText)}) Tj ET Q`);
      }
      const footer = `Page ${index + 1} of ${totalPages}`;
      page.push(`BT /F1 8 Tf ${MARGIN} ${FOOTER_Y} Td (${pdfEscape(footer)}) Tj ET`);
      this.snapshotPages[index].push(footer);
    });
    this.finished = true;
  }

  snapshot() {
    return this.snapshotPages
      .map((page, index) => [`--- page ${index + 1} ---`, ...page].join('\n'))
      .join('\n');
  }

  buildStructureObjects(rootRef, pageRefs) {
    const documentNode = {
      type: 'Document',
      title: this.metadata.documentTitle,
      children: []
    };
    for (const table of this.semanticTables) {
      const headerRows = table.headers.map(headerRow => ({
        type: 'TR',
        title: `${table.title} header`,
        children: headerRow.map(cell => ({
          type: 'TH',
          title: cell.text,
          marks: cell.marks
        }))
      }));
      const bodyRows = table.rows.map((row, index) => ({
        type: 'TR',
        title: `${table.title} row ${index + 1}`,
        children: row.map(cell => ({
          type: 'TD',
          title: cell.text,
          marks: cell.marks
        }))
      }));
      documentNode.children.push({
        type: 'Table',
        title: table.title,
        alt: `Accessible data table ${table.title} with columns ${table.headers[0]?.map(cell => cell.text).join(', ') || 'none'}`,
        children: [
          { type: 'THead', title: `${table.title} headings`, children: headerRows },
          { type: 'TBody', title: `${table.title} body`, children: bodyRows }
        ]
      });
    }

    const nodes = [];
    const assignRefs = (node) => {
      node.ref = rootRef + 1 + nodes.length;
      nodes.push(node);
      (node.children || []).forEach(assignRefs);
    };
    assignRefs(documentNode);

    const serializeNode = (node, parentRef) => {
      const attrs = [
        '/Type /StructElem',
        `/S /${node.type}`,
        `/P ${parentRef} 0 R`,
        `/T (${pdfEscape(node.title || node.type)})`
      ];
      if (node.alt) attrs.push(`/Alt (${pdfEscape(node.alt)})`);
      if (node.children?.length) {
        attrs.push(`/K [${node.children.map(child => `${child.ref} 0 R`).join(' ')}]`);
      } else if (node.marks?.length) {
        attrs.push(`/K [${node.marks.map(mark => `<< /Type /MCR /Pg ${pageRefs[mark.pageIndex]} 0 R /MCID ${mark.mcid} >>`).join(' ')}]`);
      }
      return `<< ${attrs.join(' ')} >>`;
    };

    const objects = [
      `<< /Type /StructTreeRoot /K ${documentNode.ref} 0 R /RoleMap << /Document /Document /Table /Table /THead /THead /TBody /TBody /TR /TR /TH /TH /TD /TD >> >>`
    ];
    nodes.forEach(node => {
      const parent = nodes.find(candidate => candidate.children?.includes(node));
      objects.push(serializeNode(node, parent?.ref || rootRef));
    });
    return objects;
  }

  toBuffer() {
    this.finish();
    const contentRefs = [];
    const pageRefs = [];
    const objects = [
      '',
      '',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
    ];

    this.pages.forEach((ops) => {
      const content = ops.join('\n');
      const pageRef = objects.length + 1;
      const contentRef = objects.length + 2;
      pageRefs.push(pageRef);
      contentRefs.push(contentRef);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /StructParents ${pageRefs.length - 1} /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`);
      objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    });

    const metadataXml = [
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">',
      `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(this.metadata.documentTitle)}</rdf:li></rdf:Alt></dc:title>`,
      `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(this.metadata.author)}</rdf:li></rdf:Seq></dc:creator>`,
      `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(this.metadata.subject)}</rdf:li></rdf:Alt></dc:description>`,
      `<pdf:Keywords>${xmlEscape(this.metadata.keywords)}</pdf:Keywords>`,
      '</rdf:Description>',
      '</rdf:RDF>',
      '</x:xmpmeta>',
      '<?xpacket end="w"?>'
    ].join('\n');
    const metadataRef = objects.length + 1;
    objects.push(`<< /Type /Metadata /Subtype /XML /Length ${Buffer.byteLength(metadataXml)} >>\nstream\n${metadataXml}\nendstream`);
    const structTreeRootRef = objects.length + 1;
    objects.push(...this.buildStructureObjects(structTreeRootRef, pageRefs));
    const infoRef = objects.length + 1;
    objects.push(`<< /Title (${pdfEscape(this.metadata.documentTitle)}) /Author (${pdfEscape(this.metadata.author)}) /Subject (${pdfEscape(this.metadata.subject)}) /Keywords (${pdfEscape(this.metadata.keywords)}) /CreationDate (${pdfDate(this.generatedAt)}) >>`);

    objects[0] = `<< /Type /Catalog /Pages 2 0 R /Lang (${pdfEscape(this.metadata.language)}) /ViewerPreferences << /DisplayDocTitle true >> /MarkInfo << /Marked true >> /Metadata ${metadataRef} 0 R /StructTreeRoot ${structTreeRootRef} 0 R >>`;
    objects[1] = `<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf);
  }
}

function derivativeRows(report) {
  const config = report.run.config || {};
  const snapshot = report.run.marketDataSnapshot || {};
  const metrics = report.run.metrics || {};
  const keys = [
    ['Instrument Type', config.instrumentType || snapshot.instrumentType || metrics.instrumentType],
    ['Underlying', config.underlying || snapshot.underlying],
    ['Expiry', config.expiry || snapshot.expiry],
    ['Strike', config.strike || snapshot.strike],
    ['Option Type', config.optionType || snapshot.optionType],
    ['Delta', metrics.delta ?? snapshot.delta],
    ['Gamma', metrics.gamma ?? snapshot.gamma],
    ['Theta', metrics.theta ?? snapshot.theta],
    ['Vega', metrics.vega ?? snapshot.vega],
    ['Assignment Risk', metrics.assignmentRisk || snapshot.assignmentRisk],
    ['Margin Requirement', metrics.marginRequirement || snapshot.marginRequirement],
    ['Initial Margin', metrics.initialMargin || snapshot.initialMargin],
    ['Maintenance Margin', metrics.maintenanceMargin || snapshot.maintenanceMargin]
  ];
  return keys.filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function templateFocus(template) {
  switch (template) {
    case 'prop_firm':
      return [
        ['Primary Lens', 'Risk limits, drawdown, consistency, lineage, and audit trail'],
        ['Review Priority', 'Daily loss, max drawdown, event chain integrity, and shared report controls']
      ];
    case 'investor':
      return [
        ['Primary Lens', 'Performance, confidence, reproducibility, and report access governance'],
        ['Review Priority', 'Expectancy, drawdown, confidence intervals, provenance hash, and summary metrics']
      ];
    case 'tax_accounting':
      return [
        ['Primary Lens', 'Realized PnL, fees, instrument classification, assignment, and export trail'],
        ['Review Priority', 'Accounts, timestamps, derivatives fields, commissions, and audit records']
      ];
    default:
      return [
        ['Primary Lens', 'Trading process, setup quality, R-multiple, MAE/MFE, and behavior notes'],
        ['Review Priority', 'Events, metrics, confidence bands, replay/backtest/live lineage, and lessons']
      ];
  }
}

function sectionMap(report) {
  const sections = Array.isArray(report.templateConfig?.sections) ? report.templateConfig.sections : [];
  return new Map(sections.map(section => [section.key, section.enabled !== false]));
}

function sectionEnabled(sections, key) {
  if (!sections.size) return true;
  return sections.get(key) !== false;
}

function buildReportPdf(report) {
  const template = report.template || report.run?.shareScope?.template || 'trader';
  const templateLabel = report.templateConfig?.label || REPORT_TEMPLATE_LABELS[template] || REPORT_TEMPLATE_LABELS.trader;
  const sections = sectionMap(report);
  const builder = new PaginatedReportDocument('Execution Run Report', {
    watermarkText: report.watermark || report.recipient || null,
    generatedAt: report.generatedAt,
    documentTitle: report.run.name || report.run.id,
    subject: `${String(report.run.mode || 'execution').toUpperCase()} ${templateLabel}`,
    keywords: `TradeTally,${report.run.mode || 'execution'},${template},analytics,report`
  });
  builder.titleText(
    report.run.name || report.run.id,
    `Generated ${report.generatedAt} | ${String(report.run.mode || '').toUpperCase()} | ${report.run.status} | ${templateLabel}`
  );
  builder.reportIndex([
    sectionEnabled(sections, 'audience') && 'Audience and scope',
    sectionEnabled(sections, 'overview') && 'Run overview',
    sectionEnabled(sections, 'lineage') && 'Lineage and reproducibility',
    sectionEnabled(sections, 'provenance') && 'Data provenance',
    sectionEnabled(sections, 'derivatives') && 'Options, futures, and margin',
    sectionEnabled(sections, 'metrics') && 'Metrics',
    sectionEnabled(sections, 'confidence') && 'Confidence',
    sectionEnabled(sections, 'events') && 'Event timeline',
    sectionEnabled(sections, 'access') && 'Report access audit',
    sectionEnabled(sections, 'shareAudit') && 'Share link audit'
  ]);

  if (sectionEnabled(sections, 'audience')) {
    builder.section('Audience Report Template');
    builder.keyValues([
      ['Template', templateLabel],
      ['Description', report.templateConfig?.description],
      ['Recipient', report.recipient || report.run.shareScope?.recipient],
      ['Watermark', report.watermark || report.run.shareScope?.watermark],
      ['Account Scope', report.run.shareScope?.accountIds?.join(', ')],
      ...templateFocus(template)
    ]);
  }

  if (sectionEnabled(sections, 'overview')) {
    builder.section('Run Overview');
    builder.keyValues([
      ['Run ID', report.run.id],
      ['User', report.run.userEmail || report.run.userId],
      ['Mode', report.run.mode],
      ['Status', report.run.status],
      ['Source', report.run.source],
      ['Started', report.run.startedAt],
      ['Ended', report.run.endedAt],
      ['Shared Expires', report.run.shareExpiresAt]
    ]);
  }

  if (sectionEnabled(sections, 'lineage')) {
    builder.section('Lineage and Reproducibility');
    builder.keyValues([
      ['Parent Run', report.run.parentRunId],
      ['Lineage Type', report.run.lineageType],
      ['Market Snapshot ID', report.run.marketDataSnapshotId],
      ['Config', report.run.config],
      ['Market Data Snapshot', report.run.marketDataSnapshot]
    ]);
  }

  if (sectionEnabled(sections, 'provenance')) {
    builder.section('Data Provenance');
    builder.keyValues([
      ['Provenance Hash', report.provenanceHash || report.summary?.provenanceHash],
      ['Event Chain Valid', report.eventChain?.valid === null ? 'legacy-unverified' : report.eventChain?.valid],
      ['Last Event Hash', report.eventChain?.lastEventHash],
      ['Checked Event Count', report.eventChain?.checkedEventCount]
    ]);
  }

  const derivatives = derivativeRows(report);
  if (sectionEnabled(sections, 'derivatives') && (derivatives.length > 0 || template === 'tax_accounting')) {
    builder.section('Options, Futures, and Margin');
    if (derivatives.length > 0) {
      builder.keyValues(derivatives);
    } else {
      builder.text('No derivatives-specific fields were present in this report payload', { fontSize: 9.5, lineHeight: 13 });
    }
  }

  if (sectionEnabled(sections, 'metrics')) builder.entries('Metrics', report.run.metrics || report.summary?.metrics || {});
  if (sectionEnabled(sections, 'confidence')) builder.entries('Confidence', report.run.confidence || report.summary?.confidence || {});
  if (sectionEnabled(sections, 'events')) builder.eventList(report.events || []);
  if (sectionEnabled(sections, 'access')) builder.accessList(report.reportAccesses || []);
  if (sectionEnabled(sections, 'shareAudit')) builder.shareAuditList(report.shareAudits || []);

  return builder;
}

function reportToPdf(report) {
  return buildReportPdf(report).toBuffer();
}

function reportToPdfVisualSnapshot(report) {
  const builder = buildReportPdf(report);
  builder.finish();
  return builder.snapshot();
}

function extractPdfText(pdfBuffer) {
  const text = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('latin1') : String(pdfBuffer || '');
  const streams = Array.from(text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g));
  if (streams.length === 0) return '';

  return streams.flatMap(stream => Array.from(stream[1].matchAll(/\((.*?)(?<!\\)\) Tj/g))
    .map(match => pdfUnescape(match[1])))
    .join('\n');
}

module.exports = {
  reportToCsv,
  reportToPdf,
  reportToPdfVisualSnapshot,
  extractPdfText
};
