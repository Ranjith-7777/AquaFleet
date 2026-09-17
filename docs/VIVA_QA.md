# AquaFleet Viva Question Bank

## Design and architecture

1. **What problem does AquaFleet solve?**
   It keeps vessels, expeditions, missions, underwater resources, scientific
   records and maintenance in one consistent relational system.

2. **Why use MySQL 8?**
   It supports the required relational constraints, transactions, views,
   triggers, stored procedures, indexes and EXPLAIN in a widely used engine.

3. **Why use Flask?**
   Flask provides a small, understandable REST backend where routing,
   validation, sessions and SQL remain visible enough for a student viva.

4. **Why vanilla JavaScript and Bootstrap?**
   They provide responsive UI and fetch-based workflows without adding a
   framework that would obscure the course concepts.

5. **Explain the architecture.**
   The browser sends JSON through `fetch`; Flask authenticates, authorizes and
   validates; parameterized SQL reaches MySQL; JSON results are rendered back
   into the SPA.

6. **Why not MongoDB?**
   AquaFleet has strong relationships, shared entities, M:N assignments and
   integrity rules. Foreign keys and transactions make a relational database a
   more natural fit.

7. **Why is the schema normalized?**
   It avoids duplicated vessel, zone, operator and equipment data, prevents
   update anomalies and reconstructs context with joins.

8. **What normal form does the design target?**
   It follows 1NF through 3NF principles: atomic values, no partial dependency
   on part of a key, and descriptive attributes depending on their entity key.

9. **Give a 1NF example.**
   Operator phone numbers are separate `operator_contact` rows, not a
   comma-separated field.

10. **Why are `app_user` and `operator` separate?**
    A web identity is not necessarily a mission operator, and an operator may
    not need application access. Separating security and domain concepts avoids
    a false one-to-one assumption.

## Keys and relationships

11. **What is a primary key example?**
    `mission.mission_id` uniquely identifies one mission.

12. **What is a foreign key example?**
    `mission.expedition_id` must reference an existing expedition.

13. **Explain `mission_vehicle`.**
    It resolves the Mission–Vehicle M:N relationship and stores launch and
    recovery times that belong to the assignment.

14. **Why use a composite key in `mission_vehicle`?**
    (`mission_id`, `vehicle_id`) naturally identifies one vehicle assignment
    within a mission and prevents duplicates.

15. **Why does `vehicle_battery` have three key columns?**
    Including `start_cycle` allows the same battery to be installed on the same
    vehicle during multiple historical periods.

16. **What is a weak entity in AquaFleet?**
    `telemetry_point` is identified by its owner mission plus local `log_no`;
    `sample_aliquot` similarly needs its parent sample plus `aliquot_no`.

17. **What is mandatory participation here?**
    Every FK column is NOT NULL, so each mission must have an expedition/zone
    and each telemetry point must have a mission. Parent rows may have no child.

18. **What is referential integrity?**
    A child FK cannot name a missing parent, and defined delete/update actions
    keep relationships consistent.

19. **Why use ON DELETE CASCADE?**
    It removes truly owned rows, such as telemetry when its mission is deleted,
    so impossible orphans cannot remain.

20. **Why use RESTRICT?**
    A vessel, marine zone or offshore asset with historical references should
    not silently disappear.

21. **How many FK relationships exist?**
    The final schema has 19 foreign keys: 16 cascading deletes and 3 restricted
    parent deletes.

22. **What do UNIQUE constraints protect?**
    Business identifiers such as usernames, vessel/vehicle/zone/asset names and
    operator email addresses.

23. **What do CHECK constraints protect?**
    Ranges, positivity, date ordering and enumerated states such as mission
    status, incident severity and application role.

## Queries and reporting

24. **What is an INNER JOIN used for?**
    It combines required matching rows, such as vessel, expedition, mission and
    zone in the operational chain.

25. **What is a LEFT JOIN used for?**
    It keeps a parent even when children are missing, such as a planned mission
    with no vehicle assignment.

26. **Give an aggregate example.**
    `COUNT(mission_id)` calculates missions per expedition; `AVG(depth_target)`
    summarizes target depth.

27. **Give a GROUP BY/HAVING example.**
    Group missions by expedition, then retain only expeditions with at least
    two missions using `HAVING COUNT(*) >= 2`.

28. **What is a non-correlated subquery example?**
    Select missions deeper than `(SELECT AVG(depth_target) FROM mission)`.

29. **What is a correlated subquery example?**
    A sample-count subquery compares each sample's mission ID with the current
    outer mission row.

30. **What views exist?**
    Expedition summary, mission operations, vehicle readiness, sample lineage
    and incident overview.

31. **Why use views?**
    They centralize reusable joins/derivations and give reports stable,
    read-only query sources without duplicating stored data.

32. **How is mission duration represented?**
    It is derived with `TIMESTAMPDIFF` from start/end timestamps; storing it
    would risk disagreement when a timestamp changes.

33. **How is sample lineage represented?**
    Mission owns samples; each sample owns aliquots. The lineage view joins
    expedition and mission names through these keys.

## Triggers, procedures and transactions

34. **What triggers are implemented?**
    Mission insert/update triggers enforce expedition dates and zone depth;
    mission-vehicle insert/update triggers reject retired vehicles.

35. **Why validate in Flask and triggers?**
    Flask gives early friendly errors, while triggers protect integrity for
    direct SQL and future clients too.

36. **Why not use triggers for everything?**
    Hidden database behavior can become difficult to explain. Triggers are used
    only for important cross-table invariants; ordinary validation stays explicit.

37. **What stored procedures exist?**
    Expedition report, mission summary, vehicle maintenance history and
    expedition metrics.

38. **What is an IN parameter?**
    A value supplied to a procedure, such as the mission ID passed to
    `sp_get_mission_summary`.

39. **What is an OUT parameter?**
    A variable populated by a procedure; `sp_get_expedition_metrics` returns
    mission, incident and sample totals this way.

40. **What is transaction atomicity?**
    A multi-statement workflow succeeds as one consistent unit or none of its
    changes survive.

41. **COMMIT versus ROLLBACK?**
    COMMIT makes the transaction durable; ROLLBACK discards all uncommitted
    changes.

42. **Why use a SAVEPOINT?**
    It permits correction of part of a transaction—such as a bad aliquot—while
    retaining earlier valid work like its sample.

43. **What happens if assignment fails midway?**
    The application rolls back the whole transaction, so a mission and only
    half its required resource assignments cannot remain.

44. **How is the trigger demonstrated safely?**
    The faculty script attempts an out-of-zone mission inside a handled
    transaction, catches the rejection, rolls back and proves zero rows remain.

## Indexing and performance

45. **Which dedicated reporting indexes exist?**
    Expedition status, mission status, and incident `(severity, time_reported)`.

46. **Why not index every column?**
    Indexes consume storage and slow writes. They are added for keys and proven
    filtering/join patterns, not merely because a column exists.

47. **What does EXPLAIN show?**
    MySQL's planned table access, possible/selected indexes, estimated rows and
    extra operations such as index scans or sorting.

48. **Can MySQL ignore a valid index?**
    Yes. Its cost-based optimizer may prefer a scan for a tiny table; plans can
    change as data distribution and size change.

## Security, migration and testing

49. **Authentication versus authorization?**
    Authentication proves who the user is; authorization decides which actions
    that authenticated identity may perform.

50. **How does authentication work?**
    Flask verifies a Werkzeug password hash, then stores server-derived identity
    in a cookie signed with `SECRET_KEY`.

51. **How does RBAC work?**
    The live `app_user.role` is checked against a central resource/action matrix
    before a protected route runs.

52. **Why enforce RBAC in the backend if buttons are hidden?**
    A client can call an API directly or alter browser code. Only the server can
    be the security boundary.

53. **What happens on unauthorized access?**
    Missing/invalid authentication receives 401; a valid user lacking the
    requested permission receives 403 without losing the session.

54. **How are SQL injections prevented?**
    All application values use mysql-connector `%s` parameters; dynamic report
    columns come from an internal allow-list.

55. **How are passwords protected?**
    Only one-way Werkzeug hashes are stored. Hashes are never returned, logged
    or placed in frontend code.

56. **How is the database upgraded safely?**
    A verified backup is created, then an idempotent migration adds/recreates
    final objects. The upgrade utility compares every table count and full user
    record before and after.

57. **How was AquaFleet tested?**
    Tests cover RBAC, CRUD, validation, duplicates, FKs, CHECKs, triggers,
    procedures, views, query plans, transactions, migration repeatability,
    reports and a complete workflow, plus browser checks for all roles.

58. **What is one honest limitation?**
    Telemetry is demonstration data entered through REST, not a real-time
    authenticated stream from ocean hardware.

59. **What would be a sensible future feature?**
    GIS mission tracks or IoT ingestion would build on the existing coordinates
    and normalized mission/telemetry model without replacing it.

60. **What makes this a DBMS project rather than only a web app?**
    The core behavior depends on normalized relationships, declarative
    constraints, referential actions, transactions, views, triggers, procedures,
    indexes and query plans—not merely browser forms.
