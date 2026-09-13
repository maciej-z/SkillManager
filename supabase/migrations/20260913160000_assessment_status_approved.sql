-- S-02: add the 'approved' status value ahead of any statement that
-- references it. ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction as a later statement (e.g. an RLS policy) that compares a
-- column against the new value — this migration does nothing else.
alter type public.assessment_status add value if not exists 'approved';
