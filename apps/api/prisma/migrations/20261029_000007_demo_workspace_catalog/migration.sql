-- Keep the web demo's stable label IDs so task references remain compatible.
CREATE FUNCTION "demoWorkspaceCatalog"() RETURNS JSONB
LANGUAGE SQL IMMUTABLE AS $function$
    SELECT $catalog${
      "sponsorGroups": [
        {
          "id": "sg_main",
          "name": "Main stadium sponsors",
          "description": "Primary tournament and stadium placements",
          "sponsors": [
            {"id": "s_adidas", "name": "Adidas x Messi", "logo": "", "color": "#10131c"},
            {"id": "s_gatorade", "name": "Gatorade", "logo": "", "color": "#ee6029"},
            {"id": "s_panini", "name": "Panini", "logo": "", "color": "#f4cd2d"},
            {"id": "s_hardrock", "name": "Hard Rock", "logo": "", "color": "#ba8d4b"}
          ]
        },
        {
          "id": "sg_side",
          "name": "Sideline & secondary sponsors",
          "description": "Pitchside, perimeter, and secondary brand placements",
          "sponsors": [
            {"id": "s_espn", "name": "ESPN", "logo": "", "color": "#dd2525"},
            {"id": "s_433", "name": "433", "logo": "", "color": "#272637"},
            {"id": "s_messif", "name": "Messi Fragrances", "logo": "", "color": "#867ad7"},
            {"id": "s_525", "name": "525 Rosario", "logo": "", "color": "#3db5b1"}
          ]
        }
      ],
      "eventGroups": [
        {
          "id": "eg_basic",
          "name": "Match moments",
          "items": [
            {"id": "e_goal", "name": "Goal", "kind": "range"},
            {"id": "e_celebrate", "name": "Goal celebration", "kind": "range"},
            {"id": "e_sub", "name": "Substitution", "kind": "range"},
            {"id": "e_corner", "name": "Corner", "kind": "range"},
            {"id": "e_replay", "name": "Replay", "kind": "range"}
          ]
        }
      ],
      "cameraGroups": [
        {
          "id": "cg_basic",
          "name": "Broadcast camera angles",
          "items": [
            {"id": "c_center", "name": "Wide · Center"},
            {"id": "c_left", "name": "Wide · Left goal"},
            {"id": "c_right", "name": "Wide · Right goal"},
            {"id": "c_close", "name": "Close-up / zoomed"},
            {"id": "c_crowd", "name": "Crowd / stands"},
            {"id": "c_bench", "name": "Bench / sideline"},
            {"id": "c_replay", "name": "Replay angle"}
          ]
        }
      ]
    }$catalog$::JSONB;
$function$;

-- Initialize workspaces created after deployment, including on a fresh database.
CREATE FUNCTION "initializeWorkspaceCatalog"() RETURNS TRIGGER
LANGUAGE plpgsql AS $function$
BEGIN
    INSERT INTO "WorkspaceCatalog" ("workspaceId", "payload", "version", "updatedAt")
    VALUES (NEW."id", "demoWorkspaceCatalog"(), 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("workspaceId") DO NOTHING;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER "Workspace_initialize_catalog"
AFTER INSERT ON "Workspace"
FOR EACH ROW EXECUTE FUNCTION "initializeWorkspaceCatalog"();

-- Backfill missing/empty catalogs without replacing customized definitions.
-- Increment the version so clients with an older catalog must reload before saving.
INSERT INTO "WorkspaceCatalog" ("workspaceId", "payload", "version", "updatedAt")
SELECT "id", "demoWorkspaceCatalog"(), 1, CURRENT_TIMESTAMP FROM "Workspace"
ON CONFLICT ("workspaceId") DO UPDATE
SET "payload" = "WorkspaceCatalog"."payload" || EXCLUDED."payload",
    "version" = "WorkspaceCatalog"."version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE COALESCE("WorkspaceCatalog"."payload" -> 'sponsorGroups', '[]'::JSONB) = '[]'::JSONB
  AND COALESCE("WorkspaceCatalog"."payload" -> 'eventGroups', '[]'::JSONB) = '[]'::JSONB
  AND COALESCE("WorkspaceCatalog"."payload" -> 'cameraGroups', '[]'::JSONB) = '[]'::JSONB;
