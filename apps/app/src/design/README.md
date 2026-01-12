# Design System

Platform-specific reusable UI components.

## Structure

```
design/
├── web/           # Web components (React DOM)
│   ├── Button/
│   ├── Card/
│   └── ...
└── native/        # Native components (React Native)
    ├── Button/
    ├── Card/
    └── ...
```

## Conventions

- Each component gets its own folder
- Web components use CSS Modules (`.module.css`)
- Native components use StyleSheet
- Keep components simple and focused
- Document props with TypeScript interfaces
