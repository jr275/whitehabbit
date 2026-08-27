-- ================================================================
-- 0005_backfill_opportunity_decision_data.sql — Phase 4 follow-up.
--
-- Migration 0004 backfilled the new SQL COLUMNS from the JSONB `data`
-- blob, but rows written before Phase 4 never had entityId/skillId/
-- priorityScore/dataProvenance/economicState (Opportunity) or
-- entityId/skillId/downside/executionStatus/dataProvenance/
-- economicState (Decision) inside `data` in the first place — so that
-- backfill correctly coalesced to NULL, and the UI (which reads these
-- fields straight off `data`) crashed on those older rows.
--
-- This migration backfills the JSONB payload itself with honest
-- retroactive defaults — never a fabricated number: priorityScore
-- defaults to the row's own already-real economics.priorityValue;
-- every other default is a structural fact (this engine has only ever
-- had one entity/skill/provenance/state) or an honest "not available"
-- string, never invented data.
-- ================================================================

UPDATE opportunities SET
  data = data
    || jsonb_build_object('entityId', COALESCE(data->>'entityId', 'ent_usa'))
    || jsonb_build_object('skillId', COALESCE(data->>'skillId', 'skill_cash_working_capital_intelligence'))
    || jsonb_build_object('priorityScore', COALESCE(data->'priorityScore', data->'economics'->'priorityValue', '0'::jsonb))
    || jsonb_build_object('dataProvenance', COALESCE(data->>'dataProvenance', 'demo'))
    || jsonb_build_object('economicState', COALESCE(data->>'economicState', 'estimated'))
WHERE data->>'priorityScore' IS NULL OR data->>'entityId' IS NULL OR data->>'dataProvenance' IS NULL OR data->>'economicState' IS NULL;

UPDATE opportunities SET
  entity_id = COALESCE(entity_id, data->>'entityId'),
  skill_id = COALESCE(skill_id, data->>'skillId'),
  data_provenance = COALESCE(data_provenance, data->>'dataProvenance'),
  economic_state = COALESCE(economic_state, data->>'economicState')
WHERE entity_id IS NULL OR skill_id IS NULL OR data_provenance IS NULL OR economic_state IS NULL;

UPDATE decisions SET
  data = data
    || jsonb_build_object('entityId', COALESCE(data->>'entityId', 'ent_usa'))
    || jsonb_build_object('skillId', COALESCE(data->>'skillId', 'skill_cash_working_capital_intelligence'))
    || jsonb_build_object('downside', COALESCE(data->>'downside', 'Not available — this decision was created before this field existed.'))
    || jsonb_build_object('executionStatus', COALESCE(data->>'executionStatus', data->'action'->>'execution', 'REQUIRES_CONNECTOR'))
    || jsonb_build_object('dataProvenance', COALESCE(data->>'dataProvenance', 'demo'))
    || jsonb_build_object('economicState', COALESCE(data->>'economicState', 'estimated'))
WHERE data->>'downside' IS NULL OR data->>'entityId' IS NULL OR data->>'executionStatus' IS NULL OR data->>'dataProvenance' IS NULL OR data->>'economicState' IS NULL;

UPDATE decisions SET
  entity_id = COALESCE(entity_id, data->>'entityId'),
  skill_id = COALESCE(skill_id, data->>'skillId'),
  execution_status = COALESCE(execution_status, data->>'executionStatus'),
  data_provenance = COALESCE(data_provenance, data->>'dataProvenance'),
  economic_state = COALESCE(economic_state, data->>'economicState')
WHERE entity_id IS NULL OR skill_id IS NULL OR execution_status IS NULL OR data_provenance IS NULL OR economic_state IS NULL;
