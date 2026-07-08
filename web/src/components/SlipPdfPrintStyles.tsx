/** Extra print styles when rendering a slip for WhatsApp PDF (headless Chrome). */
export function SlipPdfPrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .slip-page-wrap {
            padding: 0 !important;
            margin: 0 !important;
            min-height: 0 !important;
            background: #fff !important;
          }
          #booking-slip-root,
          #delivery-slip-root,
          #return-slip-root,
          #incomplete-slip-root,
          .slip-container,
          .slip-outfit-page {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .slip-outfit-page {
            page-break-before: always !important;
            break-before: page !important;
          }
          .slip-screen-only,
          .no-print {
            display: none !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        `,
      }}
    />
  );
}
