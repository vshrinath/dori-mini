/**
 * Dori Client API Layer
 * 
 * Decouples React UI components from the underlying transport protocol.
 * Whether running inside Electron IPC (window.dori.call), HTTP API routes,
 * or unit test fixtures, components interact with this typed contract.
 */

async function call(actionId, params = {}) {
  if (typeof window !== 'undefined' && window.dori?.call) {
    return window.dori.call(actionId, params);
  }
  console.warn(`[dori:api] window.dori.call not available for action '${actionId}'`);
  return null;
}

export const api = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Documents & Vault
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  getDocument: (path) => call('get_document', { path, relPath: path }),
  saveDocument: (path, content) => call('save_document', { path, content }),
  listDocuments: (filter = {}) => call('list_documents', filter),
  searchVault: (query) => call('search_vault', { query }),
  convertDocument: (filePath) => call('convert_document', { filePath }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Projects & Hierarchy
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listProjects: () => call('list_projects', {}),
  getProjectDetails: (projectPath) => call('get_project_details', { projectPath }),
  applyTemplate: (template, project) => call('apply_template', { template, project }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Tasks & Inbox
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listTasks: (status = 'open') => call('list_tasks', { status }),
  markTaskDone: (id) => call('mark_task_done', { id }),
  addTask: (title, project, dueDate) => call('add_task', { title, project, dueDate }),
  listInbox: (status) => call('list_inbox', status ? { status } : {}),
  approveInboxItem: (clarificationId, choiceId) => call('approve_inbox_item', { clarificationId, choiceId }),
  ignoreInboxItem: (clarificationId) => call('ignore_inbox_item', { clarificationId }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Finance & Trips
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listTrips: () => call('list_trips', {}),
  getTripLedger: (target) => call('get_trip_ledger', { target }),
  checkReimbursementGaps: (target) => call('check_reimbursement_gaps', { target }),
  routeExpense: (message, targetLedger) => call('route_expense', { message, targetLedger }),
  attachReceipt: (receipt) => call('attach_receipt', receipt),
  closeTrip: (target, status) => call('close_trip', { target, status }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Meetings & Minutes (MOM)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listFathomMeetings: (unfiledOnly = false) => call('list_fathom_meetings', { unfiledOnly }),
  getFathomMeeting: (recordingId) => call('get_fathom_meeting', { recordingId }),
  routeMeeting: (input) => call('route_meeting', input),
  processMeeting: (input) => call('process_meeting', input),
  getMeetingPrep: (attendees) => call('get_meeting_prep', { attendees }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Timeline & Activity
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  getTimeline: (params = {}) => call('timeline', params),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Entities, Organizations & Brands
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listOrgs: () => call('list_orgs', {}),
  ensureOrg: (org) => call('ensure_org', org),
  listBrands: () => call('list_brands', {}),
  getBrand: (name) => call('get_brand', { name }),
  setBrand: (brand) => call('set_brand', brand),
  researchPerson: (name, org) => call('research_person', { name, org }),
  mergeEntity: (input) => call('merge_entity', input),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Chat, Assistant & System
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  chatSend: (input) => call('chat_send', input),
  getProfile: () => call('get_profile', {}),
  setProfile: (profile) => call('set_profile', profile),
  getEngineConfig: () => call('get_engine_config', {}),
  setEngineConfig: (config) => call('set_engine_config', config),
};

export default api;
