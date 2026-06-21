/** Read visible text from a DOM table, optionally skipping the last column (e.g. Action). */
export function pdfDataFromTable(table: HTMLTableElement, excludeLastColumn = true) {
  const headerCells = table.querySelectorAll("thead tr th");
  const headerCount = headerCells.length;
  const colCount = excludeLastColumn && headerCount > 1 ? headerCount - 1 : headerCount;

  const headers = Array.from(headerCells)
    .slice(0, colCount)
    .map((th) => th.textContent?.trim().replace(/\s+/g, " ") || "");

  const rows: string[][] = [];
  table.querySelectorAll("tbody tr").forEach((tr) => {
    const cells = tr.querySelectorAll("td");
    if (!cells.length) return;
    if (cells.length === 1 && cells[0].hasAttribute("colspan")) return;

    const row = Array.from(cells)
      .slice(0, colCount)
      .map((td) => td.textContent?.trim().replace(/\s+/g, " ") || "");
    if (row.some(Boolean)) rows.push(row);
  });

  return { headers, rows };
}
