-- Backend-only access: Prisma uses the privileged server connection.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."User" FROM anon, authenticated;
ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Session" FROM anon, authenticated;
ALTER TABLE public."WalletEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."WalletEntry" FROM anon, authenticated;
ALTER TABLE public."Participant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Participant" FROM anon, authenticated;
ALTER TABLE public."Competition" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Competition" FROM anon, authenticated;
ALTER TABLE public."Rating" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Rating" FROM anon, authenticated;
ALTER TABLE public."Season" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Season" FROM anon, authenticated;
ALTER TABLE public."Fixture" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Fixture" FROM anon, authenticated;
