// These are saved test records, not product defaults.
export async function ensureDocumentTypes(request) {
  const types = await (await request.get('/api/document-types')).json();
  for (const title of ['Exam', 'Quiz', 'Worksheet']) {
    if (types.some(type => type.title === title)) continue;
    const response = await request.post('/api/document-types', { data: { title, audience: 'student', guidance: 'Create clear classroom tasks with points and answer space.' } });
    if (!response.ok()) throw new Error('Could not create test document type: ' + title);
  }
}
