const client = getClient();
let materias = [];
let historial = {};
let prelaciones = {};
let userId = null; // Se obtendría del login

async function inicializarApp() {
    // Simulamos obtener el ID del usuario actual de Supabase Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) return alert("Inicia sesión para continuar");
    userId = user.id;

    await cargarDatos();
}

async function cargarDatos() {
    // Consultas a Supabase
    const [resMat, resHist, resPre] = await Promise.all([
        client.from('materia').select('*').order('id_semestre'),
        client.from('historial').select('*').eq('id_usuario', userId),
        client.from('prelaciones').select('*')
    ]);

    materias = resMat.data;
    resHist.data.forEach(h => historial[h.id_materia] = h.estado);
    
    // Mapeo de prelaciones
    prelaciones = resPre.data.reduce((acc, curr) => {
        if (!acc[curr.id_materia]) acc[curr.id_materia] = [];
        acc[curr.id_materia].push(curr.id_prela_a);
        return acc;
    }, {});

    renderizarMalla();
}

function renderizarMalla() {
    const container = document.getElementById('app-container');
    container.innerHTML = '';

    // Agrupar materias por semestre
    const semestres = [...new Set(materias.map(m => m.id_semestre))];

    semestres.forEach(numSemestre => {
        const divSem = document.createElement('section');
        divSem.className = 'semestre-bloque';
        divSem.innerHTML = `<h3>Semestre ${numSemestre}</h3>`;

        materias.filter(m => m.id_semestre === numSemestre).forEach(mat => {
            const estado = historial[mat.id_materia] || 'no cursada';
            const bloqueada = verificarBloqueo(mat.id_materia);
            
            const card = document.createElement('div');
            card.className = `materia-card ${bloqueada ? 'bloqueada' : estado}`;
            card.innerHTML = `
                <div class="info">
                    <span class="cod">${mat.codigo}</span>
                    <span class="nom">${mat.nombre}</span>
                </div>
                <div class="status-icon">${bloqueada ? '🔒' : '●'}</div>
            `;

            if (!bloqueada) {
                card.onclick = () => actualizarEstado(mat.id_materia, estado);
            }
            divSem.appendChild(card);
        });
        container.appendChild(divSem);
    });
}

function verificarBloqueo(idMat) {
    const requisitos = prelaciones[idMat];
    if (!requisitos) return false;
    // Si alguna materia requerida no está aprobada, se bloquea
    return requisitos.some(idPre => historial[idPre] !== 'aprobado');
}

async function actualizarEstado(idMat, estadoActual) {
    const orden = ['no cursada', 'aprobado', 'reprobado'];
    const proximo = orden[(orden.indexOf(estadoActual) + 1) % orden.length];

    historial[idMat] = proximo; // Update local (Optimistic UI)
    renderizarMalla();

    await client.from('historial').upsert({
        id_usuario: userId,
        id_materia: idMat,
        estado: proximo
    });
}

window.onload = inicializarApp;