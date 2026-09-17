-- AquaFleet Phase 1 RBAC migration for an existing database.
-- Fresh installations already receive this constraint from schema.sql.
-- Run this file once against a database created before Phase 1.

USE aquafleet_db;

ALTER TABLE app_user
    DROP CHECK chk_app_user_role,
    ADD CONSTRAINT chk_app_user_role
        CHECK (role IN ('ADMIN', 'OPERATOR', 'RESEARCHER', 'VIEWER'));
