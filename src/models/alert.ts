import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";
import { sequelize } from "./database.js";
import { Service } from "./service.js";

export type AlertStatus = "firing" | "resolved";
export type AlertSeverity = "critical" | "high" | "medium" | "low";

export class Alert extends Model<
  InferAttributes<Alert>,
  InferCreationAttributes<Alert>
> {
  declare id: CreationOptional<number>;
  declare fixtureKey: string;
  declare serviceId: ForeignKey<Service["id"]>;
  declare title: string;
  declare description: string;
  declare status: AlertStatus;
  declare severity: AlertSeverity;
  declare service?: NonAttribute<Service>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Alert.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fixtureKey: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "services", key: "id" },
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM("firing", "resolved"), allowNull: false },
    severity: {
      type: DataTypes.ENUM("critical", "high", "medium", "low"),
      allowNull: false,
      defaultValue: "medium",
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "alerts" },
);

Service.hasMany(Alert, { foreignKey: "serviceId", as: "alerts" });
Alert.belongsTo(Service, { foreignKey: "serviceId", as: "service" });
