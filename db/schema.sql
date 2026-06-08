-- Exasol schema for the Natural Language Plant Ops Assistant
-- Dimensional star schema: dimensions (plants, lines, machines) + facts
-- (sensor readings, error logs, downtime events, maintenance records).
-- Statements are separated by a single ';' and applied one at a time by scripts/seed.ts.

DROP SCHEMA IF EXISTS PLANTOPS CASCADE;

CREATE SCHEMA PLANTOPS;

CREATE TABLE PLANTOPS.PLANTS (
  PLANT_ID    VARCHAR(10)  PRIMARY KEY,
  PLANT_NAME  VARCHAR(100),
  LOCATION    VARCHAR(100),
  REGION      VARCHAR(50)
);

CREATE TABLE PLANTOPS.PRODUCTION_LINES (
  LINE_ID    VARCHAR(10) PRIMARY KEY,
  PLANT_ID   VARCHAR(10),
  LINE_NAME  VARCHAR(100)
);

CREATE TABLE PLANTOPS.MACHINES (
  MACHINE_ID         VARCHAR(10) PRIMARY KEY,
  LINE_ID            VARCHAR(10),
  MACHINE_NAME       VARCHAR(100),
  MACHINE_TYPE       VARCHAR(50),
  MODEL              VARCHAR(50),
  INSTALL_DATE       DATE,
  VIBRATION_BASELINE DECIMAL(6,2),   -- normal operating vibration, mm/s
  TEMP_BASELINE      DECIMAL(6,2)    -- normal operating temperature, deg C
);

CREATE TABLE PLANTOPS.SENSOR_READINGS (
  READING_ID   DECIMAL(18,0),
  MACHINE_ID   VARCHAR(10),
  TS           TIMESTAMP,
  VIBRATION    DECIMAL(6,2),         -- mm/s
  TEMPERATURE  DECIMAL(6,2),         -- deg C
  PRESSURE     DECIMAL(6,2),         -- bar
  RPM          DECIMAL(8,1)
);

CREATE TABLE PLANTOPS.ERROR_LOGS (
  ERROR_ID    DECIMAL(18,0),
  MACHINE_ID  VARCHAR(10),
  TS          TIMESTAMP,
  ERROR_CODE  VARCHAR(10),           -- e.g. E501 (E5xx = severe), E210, W101
  SEVERITY    VARCHAR(10),           -- LOW / MEDIUM / HIGH
  DESCRIPTION VARCHAR(200)
);

CREATE TABLE PLANTOPS.DOWNTIME_EVENTS (
  EVENT_ID         DECIMAL(18,0),
  MACHINE_ID       VARCHAR(10),
  START_TS         TIMESTAMP,
  END_TS           TIMESTAMP,
  DOWNTIME_MINUTES DECIMAL(10,1),
  REASON           VARCHAR(200)
);

CREATE TABLE PLANTOPS.MAINTENANCE_RECORDS (
  RECORD_ID     DECIMAL(18,0),
  MACHINE_ID    VARCHAR(10),
  MAINT_DATE    DATE,
  MAINT_TYPE    VARCHAR(50),         -- PREVENTIVE / CORRECTIVE / INSPECTION
  NEXT_DUE_DATE DATE,
  NOTES         VARCHAR(200)
);
