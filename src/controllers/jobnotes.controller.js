/**
 * Job Notes Controller
 *
 *   POST   /api/jobnotes           — Add a note to a job
 *   GET    /api/jobnotes/:jobId    — Get all notes for a job (timeline)
 */

const airtable = require('../services/airtable.service');

async function addNote(req, res) {
  try {
    const { jobId, noteText, addedBy } = req.body;
    if (!jobId || !noteText) {
      return res.status(400).json({ error: 'Missing required fields: jobId, noteText' });
    }
    const note = await airtable.createJobNote({
      jobId,
      noteDate: new Date().toISOString().split('T')[0],
      noteText,
      addedBy:  addedBy || 'Steve'
    });
    res.status(201).json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getNotesForJob(req, res) {
  try {
    const notes = await airtable.getNotesForJob(req.params.jobId);
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { addNote, getNotesForJob };
