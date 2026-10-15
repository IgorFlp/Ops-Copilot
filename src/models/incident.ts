import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "./database.js";
import { Service } from "./service.js";

export type IncidentStatus = "open" | "resolved";
export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export class Incident extends Model<
  InferAttributes<Incident>,
  InferCreationAttributes<Incident>
> {
  declare id: CreationOptional<number>;
  declare serviceId: ForeignKey<Service["id"]>;
  declare title: string;
  declare severity: IncidentSeverity;
  declare status: IncidentStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Incident.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "services", key: "id" },
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    severity: {
      type: DataTypes.ENUM("critical", "high", "medium", "low"),
      allowNull: false,
    },
    status: { type: DataTypes.ENUM("open", "resolved"), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "incidents" },
);

Service.hasMany(Incident, { foreignKey: "serviceId", as: "incidents" });
Incident.belongsTo(Service, { foreignKey: "serviceId", as: "service" });
