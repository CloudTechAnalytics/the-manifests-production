/*
# Bill of Lading number on containers

The container-level BL number (as opposed to a shipment-wide reference)
is what ties a specific container back to its Bill of Lading — needed
before Container Number/Seal Number on the Add Container form since it's
the document number staff actually look up by first.
*/

ALTER TABLE shipment_containers ADD COLUMN IF NOT EXISTS bl_number text;
