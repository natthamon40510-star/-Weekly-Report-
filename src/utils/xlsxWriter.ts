/**
 * In-browser styled XLSX workbook builder using standard OpenXML and ZIP
 * Faithfully matches the exact styling from the user's template.
 */
export const XL = (() => {
  const esc = (s: unknown) =>
    String(s ?? '')
      .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  const colName = (n: number) => {
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  const enc = new TextEncoder();
  let T: Uint32Array | null = null;
  const crc = (u: Uint8Array) => {
    if (!T) {
      T = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        T[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  function zip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
    const parts: Uint8Array[] = [];
    const cen: Uint8Array[] = [];
    let off = 0;

    for (const f of files) {
      const name = enc.encode(f.name);
      const d = f.data;
      const c = crc(d);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(12, 0x21, true);
      lh.setUint32(14, c, true);
      lh.setUint32(18, d.length, true);
      lh.setUint32(22, d.length, true);
      lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, d);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true);
      ch.setUint32(16, c, true);
      ch.setUint32(20, d.length, true);
      ch.setUint32(24, d.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), name);

      off += 30 + name.length + d.length;
    }

    let cl = 0;
    for (const u of cen) cl += u.length;
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, cl, true);
    e.setUint32(16, off, true);

    const all = [...parts, ...cen, new Uint8Array(e.buffer)];
    let totalLen = 0;
    for (const u of all) totalLen += u.length;
    const out = new Uint8Array(totalLen);
    let o = 0;
    for (const u of all) {
      out.set(u, o);
      o += u.length;
    }
    return out;
  }

  interface CellStyle {
    b?: number;
    i?: number;
    sz?: number;
    c?: string;
    bg?: string;
    bl?: [string, string];
    br?: [string, string];
    bt?: [string, string];
    bb?: [string, string];
    nf?: string;
    h?: string;
    v?: string;
    w?: number;
    ind?: number;
  }

  interface SheetData {
    name: string;
    rows: Map<number, Map<number, { v: unknown; s: number }>>;
    merges: string[];
    cols: number[];
    hts: Map<number, number>;
    img: { png: Uint8Array; w: number; h: number; col: number; row: number; dx: number; dy: number } | null;
  }

  class Book {
    sheets: SheetData[] = [];
    fonts: string[] = [];
    fills: string[] = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
    ];
    borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    fmts: string[] = [];
    xfs: string[] = [];
    keys = new Map<string, number>();

    constructor() {
      this.xf({});
    }

    xf(s: CellStyle): number {
      const k = JSON.stringify(s);
      if (this.keys.has(k)) return this.keys.get(k)!;

      const fo = `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}<sz val="${s.sz || 11}"/><color rgb="FF${
        s.c || '16233F'
      }"/><name val="Tahoma"/><family val="2"/></font>`;
      let fi = this.fonts.indexOf(fo);
      if (fi < 0) {
        fi = this.fonts.length;
        this.fonts.push(fo);
      }

      let fl = 0;
      if (s.bg) {
        const f = `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.bg}"/><bgColor indexed="64"/></patternFill></fill>`;
        fl = this.fills.indexOf(f);
        if (fl < 0) {
          fl = this.fills.length;
          this.fills.push(f);
        }
      }

      const side = (n: string, v?: [string, string]) =>
        v ? `<${n} style="${v[0]}"><color rgb="FF${v[1]}"/></${n}>` : `<${n}/>`;
      const bo = `<border>${side('left', s.bl)}${side('right', s.br)}${side('top', s.bt)}${side(
        'bottom',
        s.bb
      )}<diagonal/></border>`;
      let bi = this.borders.indexOf(bo);
      if (bi < 0) {
        bi = this.borders.length;
        this.borders.push(bo);
      }

      let nf = 0;
      if (s.nf) {
        let i = this.fmts.indexOf(s.nf);
        if (i < 0) {
          i = this.fmts.length;
          this.fmts.push(s.nf);
        }
        nf = 164 + i;
      }

      const al =
        s.h || s.v || s.w || s.ind
          ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''} vertical="${s.v || 'center'}"${
              s.w ? ' wrapText="1"' : ''
            }${s.ind ? ` indent="${s.ind}"` : ''}/>`
          : '';

      const x = `<xf numFmtId="${nf}" fontId="${fi}" fillId="${fl}" borderId="${bi}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${
        al ? ` applyAlignment="1">${al}</xf>` : '/>'
      }`;
      const id = this.xfs.length;
      this.xfs.push(x);
      this.keys.set(k, id);
      return id;
    }

    sheet(name: string, widths?: number[]): SheetData {
      const sh: SheetData = {
        name,
        rows: new Map(),
        merges: [],
        cols: widths || [],
        hts: new Map(),
        img: null,
      };
      this.sheets.push(sh);
      return sh;
    }

    set(sh: SheetData, r: number, c: number, v: unknown, s?: CellStyle) {
      let row = sh.rows.get(r);
      if (!row) {
        row = new Map();
        sh.rows.set(r, row);
      }
      row.set(c, { v, s: this.xf(s || {}) });
    }

    box(sh: SheetData, r1: number, c1: number, r2: number, c2: number, s?: CellStyle) {
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const row = sh.rows.get(r);
          if (!(row && row.has(c))) this.set(sh, r, c, null, s);
        }
      }
    }

    merge(sh: SheetData, r1: number, c1: number, r2: number, c2: number, v: unknown, s?: CellStyle) {
      this.set(sh, r1, c1, v, s);
      this.box(sh, r1, c1, r2, c2, s);
      if (r1 !== r2 || c1 !== c2) sh.merges.push(`${colName(c1)}${r1}:${colName(c2)}${r2}`);
    }

    build(): Uint8Array {
      const NS =
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
      const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
      const files: Array<{ name: string; data: Uint8Array }> = [];
      const ct: string[] = [];
      let img = 0;
      let drw = 0;

      this.sheets.forEach((sh, i) => {
        const n = i + 1;
        const rowsXml = [...sh.rows.keys()]
          .sort((a, b) => a - b)
          .map(r => {
            const row = sh.rows.get(r)!;
            const ht = sh.hts.get(r);
            return (
              `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>` +
              [...row.keys()]
                .sort((a, b) => a - b)
                .map(c => {
                  const cell = row.get(c)!;
                  const v = cell.v;
                  const ref = colName(c) + r;
                  if (v == null || v === '') return `<c r="${ref}" s="${cell.s}"/>`;
                  if (typeof v === 'number') return `<c r="${ref}" s="${cell.s}"><v>${v}</v></c>`;
                  return `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
                })
                .join('') +
              '</row>'
            );
          })
          .join('');

        const cols = sh.cols.length
          ? `<cols>${sh.cols
              .map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`)
              .join('')}</cols>`
          : '';

        let xml =
          `${H}<worksheet ${NS}><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"${
            i === 0 ? ' tabSelected="1"' : ''
          }/></sheetViews><sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${rowsXml}</sheetData>${
            sh.merges.length
              ? `<mergeCells count="${sh.merges.length}">${sh.merges
                  .map(m => `<mergeCell ref="${m}"/>`)
                  .join('')}</mergeCells>`
              : ''
          }<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>`;

        if (sh.img) {
          img++;
          drw++;
          const I = sh.img;
          xml += '<drawing r:id="rId1"/>';
          files.push({
            name: `xl/worksheets/_rels/sheet${n}.xml.rels`,
            data: enc.encode(
              `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drw}.xml"/></Relationships>`
            ),
          });
          const cx = Math.round(I.w * 9525);
          const cy = Math.round(I.h * 9525);
          files.push({
            name: `xl/drawings/drawing${drw}.xml`,
            data: enc.encode(
              `${H}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>${
                I.col
              }</xdr:col><xdr:colOff>${Math.round(I.dx * 9525)}</xdr:colOff><xdr:row>${I.row}</xdr:row><xdr:rowOff>${Math.round(
                I.dy * 9525
              )}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo" descr="ตราบริษัท"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`
            ),
          });
          files.push({
            name: `xl/drawings/_rels/drawing${drw}.xml.rels`,
            data: enc.encode(
              `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${img}.png"/></Relationships>`
            ),
          });
          files.push({ name: `xl/media/image${img}.png`, data: I.png });
          ct.push(
            `<Override PartName="/xl/drawings/drawing${drw}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
          );
        }

        xml += '</worksheet>';
        files.push({ name: `xl/worksheets/sheet${n}.xml`, data: enc.encode(xml) });
        ct.push(
          `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        );
      });

      const styles = `${H}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
        this.fmts.length
          ? `<numFmts count="${this.fmts.length}">${this.fmts
              .map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`)
              .join('')}</numFmts>`
          : ''
      }<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${
        this.fills.length
      }">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join(
        ''
      )}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${
        this.xfs.length
      }">${this.xfs.join(
        ''
      )}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

      const wbx = `${H}<workbook ${NS}><bookViews><workbookView/></bookViews><sheets>${this.sheets
        .map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`;

      const wbr = `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
              i + 1
            }.xml"/>`
        )
        .join(
          ''
        )}<Relationship Id="rId${this.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

      const ctx = `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct.join(
        ''
      )}</Types>`;

      const root = `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

      return zip([
        { name: '[Content_Types].xml', data: enc.encode(ctx) },
        { name: '_rels/.rels', data: enc.encode(root) },
        { name: 'xl/workbook.xml', data: enc.encode(wbx) },
        { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbr) },
        { name: 'xl/styles.xml', data: enc.encode(styles) },
        ...files,
      ]);
    }
  }

  return { Book, zip };
})();
