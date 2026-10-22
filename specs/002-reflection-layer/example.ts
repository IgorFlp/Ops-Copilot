//Exemplo de implementação dentro do padrão de reflection
const veredictSchema = z.object({
    approved: z.boolean(),
    feedback: z.string().describe("Se aprovado: o que corrigir, em especifico e acionavel"),
})

async function critique(input: string, resut: ReasoningResult){
    return createModel().withStructuredOutput(verdictSchema).invoke(
        ["system", CRITIC_PROMPT], //Avalie apenas contra as observações do trace e do pedido)
        ["user", `Pedido: ${input} \n\n Observações: ${observationsOf(resut.trace)} \n\n Resposta: ${resut.answer}`]
}