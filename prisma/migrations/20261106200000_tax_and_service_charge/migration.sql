-- AlterTable: Add tax and service charge configuration to restaurant_settings
ALTER TABLE `restaurant_settings`
  ADD COLUMN `prices_include_tax` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `service_charge_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `max_cashier_discount_percent` DECIMAL(5, 2) NOT NULL DEFAULT 20.00;

-- AlterTable: Add service_minor to orders
ALTER TABLE `orders`
  ADD COLUMN `service_minor` INT NOT NULL DEFAULT 0;
