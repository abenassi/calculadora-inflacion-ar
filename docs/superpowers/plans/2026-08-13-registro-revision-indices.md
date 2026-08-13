# Registro de revisión — índices jurisdiccionales

Es el registro del paso 4.3 de la skill `cambiar-la-calculadora`. Acumula **todo** lo que
los revisores levantaron, no sólo lo arreglado: sin los rechazados anotados con su razón,
el loop no converge porque cada vuelta vuelve a traer lo mismo.

## El caso concreto (paso 1)

Una contadora tiene que actualizar un presupuesto de un cliente de Córdoba y el cliente le
discute que la inflación nacional no es la que él ve en su ciudad. Hoy la calculadora sólo
sabe contestar con el nacional.

**Caso de prueba, el mismo en todas las vueltas:** $520.000 de mayo 2024 a junio 2026.

- Nacional: `?monto=520000&desde=2024-05&hasta=2026-06`
- Córdoba: `…&indice=cordoba`
- Neuquén (viene 5 meses atrasado): `…&indice=neuquen`
- Santa Fe con un período que no existe: `?monto=520000&desde=1995-01&hasta=2026-06&indice=santa-fe`
- Región Noreste (no es el índice de ninguna provincia): `…&indice=noreste`
- Un índice que no existe: `…&indice=atlantida`

Servidor: `http://localhost:5175`

## Hallazgos

| # | Hallazgo | Quién | Verificado | Qué se hizo |
|---|---|---|---|---|
| 0 | Un link con `?indice=santa-fe&desde=1995-01` dejaba el desplegable de años en blanco y el sitio contestaba "Mes inválido: -01" | yo, abriendo el browser antes de despachar | sí, reproducido | arreglado antes de la vuelta 1: el período de la URL pasa por el mismo acotado que el cambio de índice |

### Vuelta 1 — Vanina (usuaria)

**La pregunta que podía frenar el diseño**: el formulario pasó de dos campos a tres.
Contestó que **no le metió ruido** — el campo ya viene contestado, está en su propio
renglón y no le pisa el monto ni las fechas. El diseño sigue.

| # | Hallazgo | Quién | Verificado | Qué se hizo |
|---|---|---|---|---|
| 1 | **Neuquén da $1.761.628 contra $1.012.518 del nacional**, mismo monto y mismas fechas, y la opción marcada "(recomendado)" es la que da el número raro. La otra da $1.125.371: $636.000 de diferencia | usuaria | **sí, y peor de lo que reportó**: la inflación real de Neuquén en el tramo disponible (may-24→ene-26) es 90,29%, contra 94,72% del nacional. Los 238,77% salen enteros de correr la ventana hasta dic-2023 y tragarse enero 2024 (+24,50%) | pendiente — es metodológico, se decide con el economista |
| 2 | La tabla de una región dice `INDEC ✓`, idéntica a la nacional. "Yo a la clienta le mando una foto de la tabla, no la pantalla entera" | usuaria | sí, reproducido en el browser | arreglado: ahora dice `INDEC Noreste ✓` |
| 3 | El aviso de atraso está en el mismo gris y tamaño que la descripción neutra del índice, pegado atrás. Lo leyó recién cuando fue a buscar por qué el número era raro | usuaria | sí | arreglado: nodo propio, renglón propio y fondo de advertencia |
| 4 | El encabezado sigue diciendo "según el IPC del INDEC" con Tucumán elegido | usuaria | sí | arreglado: la bajada sigue al índice |
| 5 | "oficial DE Tucumán" se lee como la preposición «de», no como una sigla | usuaria | sí, aparece 25 veces en el texto que se copia | arreglado: la sigla pasó a "Estadística Tucumán" |
| 6 | `datos.html` decía "sólo diez lo miden" y listaba a Jujuy, pero en el desplegable hay nueve. "Si soy de Jujuy me ilusiono al pedo" | usuaria | sí | arreglado: dice nueve, y Jujuy va en un párrafo aparte con el motivo |
| 7 | "serie empalmada" en la descripción de Córdoba es jerga | usuaria | sí | arreglado |
| 8 | La etiqueta "según el IPC" hace preguntar "¿el IPC qué?" | usuaria | sí, aunque ella misma aclara que no la trabó | arreglado: dice "según el índice" |
| 9 | En celular (390×844) el número grande queda a 739px con el nacional y a 821px con una provincia: hay que scrollear para ver el resultado | usuaria | pendiente de verificar | pendiente |
| 10 | El texto que se copia tiene 25 renglones y no se puede mandar por WhatsApp. Pide un "copiar resumen" además del completo | usuaria | sí, pero es **anterior a este cambio** | **rechazado por alcance**: es un problema real del botón de copiar que existe desde antes y no lo introdujo esta feature. Va a un cambio aparte para no seguir engordando éste — el techo de la skill existe justamente para eso |
| 11 | La tabla arranca en un mes que ella no pidió (dic-2023) | usuaria | sí | es el síntoma del #1, se resuelve con él |
