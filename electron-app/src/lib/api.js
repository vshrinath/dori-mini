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
  getDocument: (input) => {
    const p = typeof input === 'string' ? input : (input?.path || input?.relPath);
    return call('get_document', { path: p, relPath: p });
  },
  saveDocument: (pathOrInput, content) => {
    if (typeof pathOrInput === 'object' && pathOrInput !== null) {
      const p = pathOrInput.path || pathOrInput.relPath;
      return call('save_document', { path: p, content: pathOrInput.content ?? content });
    }
    return call('save_document', { path: pathOrInput, content });
  },
  listDocuments: (filter = {}) => {
    const params = typeof filter === 'number' ? { limit: filter } : (filter || {});
    return call('list_documents', params);
  },
  searchVault: (queryOrInput, limit = 20) => {
    if (typeof queryOrInput === 'object' && queryOrInput !== null) {
      return call('search_vault', {
        query: queryOrInput.query,
        limit: queryOrInput.limit ?? limit,
      });
    }
    return call('search_vault', { query: queryOrInput, limit });
  },
  convertDocument: (input) => {
    const filePath = typeof input === 'string' ? input : (input?.filePath || input?.sourcePath || input?.path || input?.relPath);
    return call('convert_document', { filePath });
  },
  routeDestination: (params) => call('route_destination', params || {}),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Quick Capture
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  captureText: (textOrInput) => {
    const text = typeof textOrInput === 'string' ? textOrInput : textOrInput?.text;
    return call('capture_text', { text });
  },
  captureFile: (sourcePathOrInput) => {
    const sourcePath = typeof sourcePathOrInput === 'string'
      ? sourcePathOrInput
      : (sourcePathOrInput?.sourcePath || sourcePathOrInput?.filePath || sourcePathOrInput?.path);
    return call('capture_file', { sourcePath });
  },
  captureUrl: (urlOrInput, title, projectPath) => {
    if (typeof urlOrInput === 'object' && urlOrInput !== null) {
      return call('capture_url', {
        url: urlOrInput.url,
        title: urlOrInput.title,
        projectPath: urlOrInput.projectPath || urlOrInput.project,
      });
    }
    return call('capture_url', { url: urlOrInput, title, projectPath });
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Projects & Templates
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listProjects: () => call('list_projects', {}),
  getProjectDetails: (input) => {
    const projectPath = typeof input === 'string' ? input : (input?.projectPath || input?.path);
    return call('get_project_details', { projectPath });
  },
  applyTemplate: (templateOrInput, project, vars) => {
    if (typeof templateOrInput === 'object' && templateOrInput !== null) {
      return call('apply_template', {
        template: templateOrInput.templateName || templateOrInput.template || templateOrInput.templateKey,
        project: templateOrInput.targetDir || templateOrInput.projectPath || templateOrInput.project,
        vars: templateOrInput.vars || vars,
      });
    }
    return call('apply_template', { template: templateOrInput, project, vars });
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Tasks & Inbox
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listTasks: (statusOrInput = 'open') => {
    const status = typeof statusOrInput === 'string' ? statusOrInput : (statusOrInput?.status || 'open');
    return call('list_tasks', { status });
  },
  markTaskDone: (idOrInput) => {
    const id = typeof idOrInput === 'string' ? idOrInput : idOrInput?.id;
    return call('mark_task_done', { id });
  },
  addTask: (inputOrTitle, due, owner) => {
    if (typeof inputOrTitle === 'object' && inputOrTitle !== null) {
      return call('add_task', {
        title: inputOrTitle.title,
        due: inputOrTitle.due || inputOrTitle.dueDate,
        owner: inputOrTitle.owner,
      });
    }
    return call('add_task', { title: inputOrTitle, due, owner });
  },
  listInbox: (statusOrInput) => {
    const status = typeof statusOrInput === 'string' ? statusOrInput : statusOrInput?.status;
    return call('list_inbox', status ? { status } : {});
  },
  approveInboxItem: (idOrInput, choiceId) => {
    if (typeof idOrInput === 'object' && idOrInput !== null) {
      return call('approve_inbox_item', {
        clarificationId: idOrInput.clarificationId || idOrInput.id,
        choiceId: idOrInput.choiceId || idOrInput.destination || idOrInput.choice,
      });
    }
    return call('approve_inbox_item', { clarificationId: idOrInput, choiceId });
  },
  ignoreInboxItem: (idOrInput) => {
    const clarificationId = typeof idOrInput === 'string' ? idOrInput : (idOrInput?.clarificationId || idOrInput?.id);
    return call('ignore_inbox_item', { clarificationId });
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Finance & Trips
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listTripLedgers: () => call('list_trip_ledgers', {}),
  listTrips: () => call('list_trip_ledgers', {}),
  getTripLedger: (input) => {
    const target = typeof input === 'string'
      ? input
      : (input?.target || input?.tripName || input?.threadId || input?.trip);
    return call('get_trip_ledger', { target });
  },
  checkReimbursementGaps: (input) => {
    const target = typeof input === 'string'
      ? input
      : (input?.target || input?.tripName || input?.threadId);
    return call('check_reimbursement_gaps', { target });
  },
  routeExpense: (messageOrInput, key) => {
    if (typeof messageOrInput === 'object' && messageOrInput !== null) {
      return call('route_expense', {
        message: messageOrInput.message,
        key: messageOrInput.key || messageOrInput.targetLedger,
      });
    }
    return call('route_expense', { message: messageOrInput, key });
  },
  attachReceipt: (receipt) => call('attach_receipt', receipt || {}),
  closeTrip: (targetOrInput, status) => {
    if (typeof targetOrInput === 'object' && targetOrInput !== null) {
      return call('close_trip', {
        target: targetOrInput.target || targetOrInput.tripName || targetOrInput.threadId,
        status: targetOrInput.status || status,
      });
    }
    return call('close_trip', { target: targetOrInput, status });
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Meetings & Minutes (MOM)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listFathomMeetings: (opts = {}) => {
    if (typeof opts === 'boolean') {
      return call('list_fathom_meetings', { includeFiled: opts });
    }
    const { includeFiled, unfiledOnly, since } = opts || {};
    return call('list_fathom_meetings', {
      includeFiled: includeFiled ?? (unfiledOnly != null ? !unfiledOnly : false),
      since,
    });
  },
  getFathomMeeting: (idOrInput, since) => {
    if (typeof idOrInput === 'object' && idOrInput !== null) {
      return call('get_fathom_meeting', {
        recordingId: idOrInput.recordingId || idOrInput.meetingId,
        since: idOrInput.since || since,
      });
    }
    return call('get_fathom_meeting', { recordingId: idOrInput, since });
  },
  routeMeeting: (input) => {
    if (Array.isArray(input)) {
      return call('route_meeting', { attendees: input });
    }
    return call('route_meeting', {
      attendees: input?.attendees || [],
      selfName: input?.selfName,
      key: input?.key || input?.destination,
    });
  },
  processMeeting: (input, force) => {
    if (typeof input === 'string') {
      return call('process_meeting', { relPath: input, force: Boolean(force) });
    }
    return call('process_meeting', {
      relPath: input?.relPath || input?.path,
      force: Boolean(input?.force || force),
    });
  },
  getMeetingPrep: (attendeesOrInput, project) => {
    if (Array.isArray(attendeesOrInput)) {
      return call('get_meeting_prep', { attendees: attendeesOrInput, project });
    }
    return call('get_meeting_prep', {
      attendees: attendeesOrInput?.attendees || [],
      project: attendeesOrInput?.project || project,
    });
  },
  fileMeeting: (meeting) => {
    return call('file_meeting', {
      title: meeting?.title,
      date: meeting?.date,
      transcript: meeting?.transcript,
      attendees: meeting?.attendees,
      projectPath: meeting?.projectPath || meeting?.project,
      fathomRecordingId: meeting?.fathomRecordingId || meeting?.meetingId,
      fathomUrl: meeting?.fathomUrl,
      durationMin: meeting?.durationMin,
      minutes: meeting?.minutes || meeting?.notes,
    });
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Entities, Organizations, Accounts & Brands
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listOrgs: () => call('list_orgs', {}),
  listAccounts: () => call('list_accounts', {}),
  listPeople: () => call('list_people', {}),
  ensureOrg: (input) => {
    if (typeof input === 'string') {
      return call('ensure_org', { orgName: input });
    }
    return call('ensure_org', {
      orgName: input?.orgName || input?.name,
      personSlug: input?.personSlug,
      personName: input?.personName,
      evidenceText: input?.evidenceText,
      role: input?.role,
      requireEvidence: input?.requireEvidence,
    });
  },
  listBrands: () => call('list_brands', {}),
  getBrand: (input) => {
    const name = typeof input === 'string' ? input : (input?.name || input?.brandId);
    return call('get_brand', { name });
  },
  getBrandContext: (input) => {
    const name = typeof input === 'string' ? input : (input?.name || input?.brandId);
    return call('get_brand_context', { name });
  },
  setBrand: (input, theme) => {
    if (typeof input === 'string') {
      return call('set_brand', { name: input, ...theme });
    }
    return call('set_brand', {
      name: input?.name || input?.brandId,
      owner: input?.owner,
      company: input?.company,
      primary: input?.primary,
      accent: input?.accent,
      fontDisplay: input?.fontDisplay,
      fontBody: input?.fontBody,
      logo: input?.logo,
      ...(input?.theme || {}),
    });
  },
  researchPerson: (nameOrInput, company, context) => {
    if (typeof nameOrInput === 'object' && nameOrInput !== null) {
      return call('research_person', nameOrInput);
    }
    return call('research_person', { name: nameOrInput, company, context });
  },
  researchAndRecommend: (input) => {
    if (typeof input === 'string') {
      return call('research_and_recommend', { name: input });
    }
    return call('research_and_recommend', {
      name: input?.name || input?.entityName,
      company: input?.company,
      context: input?.context,
      project: input?.project,
    });
  },
  mergeEntity: (input) => {
    return call('merge_entity', {
      type: input?.type,
      sourceSlug: input?.sourceSlug || input?.sourceId,
      targetSlug: input?.targetSlug || input?.targetId,
    });
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Decisions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listDecisions: (statusOrInput) => {
    const status = typeof statusOrInput === 'string' ? statusOrInput : statusOrInput?.status;
    return call('list_decisions', status ? { status } : {});
  },
  createDecision: (decision) => call('create_decision', decision || {}),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Credentials Vault
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listCredentials: (serviceOrInput) => {
    const service = typeof serviceOrInput === 'string' ? serviceOrInput : serviceOrInput?.service;
    return call('list_credentials', service ? { service } : {});
  },
  findCredentials: (queryOrInput) => {
    const query = typeof queryOrInput === 'string' ? queryOrInput : queryOrInput?.query;
    return call('find_credentials', { query });
  },
  startCredentialServer: () => call('start_credential_server', {}),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Timeline & Activity
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  listTimeline: (params = {}) => call('timeline', params || {}),
  getTimeline: (params = {}) => call('timeline', params || {}),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Chat, Assistant & System
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  chatSend: (input) => call('chat_send', input || {}),
  getProfile: () => call('get_profile', {}),
  setProfile: (profile) => call('set_profile', profile || {}),
  saveProfile: (input) => {
    const profile = input?.profile || input || {};
    return call('save_profile', profile);
  },
  getEngineConfig: () => call('get_engine_config', {}),
  setEngineConfig: (input) => {
    if (typeof input === 'string') {
      return call('set_engine_config', { replyCli: input });
    }
    const replyCli = input?.config?.replyCli || input?.replyCli || input?.engine;
    return call('set_engine_config', { replyCli });
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Preload Bridge & Event Listeners
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  getFilePath: (file) => {
    if (typeof window !== 'undefined' && window.dori?.getFilePath) {
      return window.dori.getFilePath(file);
    }
    return file?.path || file?.name || '';
  },
  onOpenSettings: (callback) => {
    if (typeof window !== 'undefined' && window.dori?.onOpenSettings) {
      return window.dori.onOpenSettings(callback);
    }
    return () => {};
  },
  onChatDelta: (callback) => {
    if (typeof window !== 'undefined' && window.dori?.onChatDelta) {
      return window.dori.onChatDelta(callback);
    }
    return () => {};
  },
  closeMini: () => {
    if (typeof window !== 'undefined' && window.dori?.closeMini) {
      return window.dori.closeMini();
    }
  },
};

export default api;
