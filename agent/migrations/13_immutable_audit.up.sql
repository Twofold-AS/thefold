-- Make agent_audit_log immutable (prevent UPDATE and DELETE)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_audit_immutability
  BEFORE UPDATE OR DELETE ON agent_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
