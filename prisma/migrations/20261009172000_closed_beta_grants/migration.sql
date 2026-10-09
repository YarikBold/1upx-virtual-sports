INSERT INTO "WalletEntry" ("id", "userId", "amount", "reason", "idempotencyKey") VALUES
('5f6a3e3a-93d5-4f45-b6bb-000000000001','f5f4afc4-20cb-4325-847a-23c7cd4f484c',10000,'STARTING_GRANT','seed:admin'),
('5f6a3e3a-93d5-4f45-b6bb-000000000002','41d4ce01-2629-481b-b290-8e160efb5c62',10000,'STARTING_GRANT','seed:player01'),
('5f6a3e3a-93d5-4f45-b6bb-000000000003','fcb49006-b4b3-493f-bbe8-7ffb9edaceb2',10000,'STARTING_GRANT','seed:player02'),
('5f6a3e3a-93d5-4f45-b6bb-000000000004','e4cb522d-7997-4d03-904b-ed4db8645157',10000,'STARTING_GRANT','seed:player03'),
('5f6a3e3a-93d5-4f45-b6bb-000000000005','d2503926-1eed-4491-a5a2-2fe769f46ec1',10000,'STARTING_GRANT','seed:player04')
ON CONFLICT ("idempotencyKey") DO NOTHING;
