import "react";

declare module "react" {
  interface Touch {
    force: number;
    radiusX: number;
    radiusY: number;
    rotationAngle: number;
  }
}
