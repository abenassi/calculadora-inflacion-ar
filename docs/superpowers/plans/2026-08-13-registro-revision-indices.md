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

_(las vueltas se agregan abajo)_
