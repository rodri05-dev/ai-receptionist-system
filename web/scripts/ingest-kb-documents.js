require('dotenv').config();
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function chunkText(text, maxChars = 900, overlap = 150) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < clean.length; start += (maxChars - overlap)) {
    const piece = clean.slice(start, start + maxChars).trim();
    if (piece.length > 60) chunks.push(piece);
  }
  return chunks;
}

async function ingest(filePath, { title, sourceType }) {
  const parsed = await pdfParse(fs.readFileSync(filePath));
  const chunks = chunkText(parsed.text);
  if (!chunks.length) throw new Error('No extractable text — this PDF is probably a scan, not real text.');

  const { data: doc, error } = await supabase.from('kb_documents').insert({
    title, source_type: sourceType, original_filename: filePath.split(/[\\/]/).pop()
  }).select().single();
  if (error) throw error;

  for (let i = 0; i < chunks.length; i += 100) {
    const batch = chunks.slice(i, i + 100).map(content => ({ document_id: doc.id, content }));
    const { error: e } = await supabase.from('kb_chunks').insert(batch);
    if (e) throw e;
    console.log(`  ${Math.min(i + 100, chunks.length)}/${chunks.length}`);
  }
  console.log(`Done: "${title}" — ${chunks.length} chunks, document ${doc.id}`);
}

const [, , filePath, title] = process.argv;
if (!filePath) { console.error('Usage: node scripts/ingest-kb-document.js <file.pdf> "<title>"'); process.exit(1); }
ingest(filePath, { title: title || 'Untitled', sourceType: 'business_faq' }).catch(e => { console.error(e); process.exit(1); });