// An optional, unscheduled curriculum. Each lesson is an independently editable session.
import { insert, type Change } from './changes'
import { newCheckpoint, newResource, newSession, newSessionResource, newStage, newTask, newTopic, newTrack, type Ctx } from './factories'
import type { ResourceType, Snapshot } from './types'

type Key = 'bio' | 'comp' | 'ai'
type Lesson = { track: Key; title: string; tasks: string[]; output: string; resource: string; portion: string }
type Unit = { title: string; weeks: [number, number]; checkpoint: string; lessons: Lesson[] }
const lesson = (track: Key, title: string, tasks: string, output: string, resource: string, portion: string): Lesson => ({ track, title, tasks: tasks.split(' | '), output, resource, portion })
const refs: Record<string, { title: string; url: string; type: ResourceType }> = {
 protein: { title: 'EMBL-EBI: Foundations of protein structure', url: 'https://www.ebi.ac.uk/training/online/courses/foundations-protein-structure/', type: 'course' },
 binding: { title: 'EMBL-EBI: Protein interactions and their importance', url: 'https://www.ebi.ac.uk/training/online/courses/protein-interactions-and-their-importance/', type: 'course' },
 antibody: { title: 'PDB-101: Antibodies', url: 'https://pdb101.rcsb.org/motm/021', type: 'article' },
 pdb: { title: 'PDB-101: Understanding PDB data', url: 'https://pdb101.rcsb.org/learn/guide-to-understanding-pdb-data/introduction', type: 'documentation' },
 cell: { title: 'NCBI Bookshelf: Molecular Biology of the Cell', url: 'https://www.ncbi.nlm.nih.gov/books/NBK21054/', type: 'book' },
 python: { title: 'Python tutorial', url: 'https://docs.python.org/3/tutorial/', type: 'documentation' },
 numpy: { title: 'NumPy quickstart', url: 'https://numpy.org/doc/stable/user/quickstart.html', type: 'documentation' },
 git: { title: 'Pro Git', url: 'https://git-scm.com/book/en/v2', type: 'book' },
 math: { title: 'Mathematics for Machine Learning', url: 'https://mml-book.github.io/', type: 'book' },
 stats: { title: 'OpenIntro Statistics', url: 'https://www.openintro.org/book/os/', type: 'book' },
 sklearn: { title: 'scikit-learn: Model selection and evaluation', url: 'https://scikit-learn.org/stable/model_selection.html', type: 'documentation' },
 torch: { title: 'PyTorch: Learn the Basics', url: 'https://docs.pytorch.org/tutorials/beginner/basics/intro.html', type: 'documentation' },
 attention: { title: 'Attention Is All You Need', url: 'https://arxiv.org/abs/1706.03762', type: 'paper' },
 esm: { title: 'Evolutionary-scale prediction of atomic-level protein structure with a language model', url: 'https://www.science.org/doi/10.1126/science.ade2574', type: 'paper' },
 bioai: { title: 'UIUC: Machine Learning for Bioinformatics', url: 'https://gelab-uiuc.github.io/cs582mlb/', type: 'course' },
 alphafold: { title: 'Highly accurate protein structure prediction with AlphaFold', url: 'https://www.nature.com/articles/s41586-021-03819-2', type: 'paper' },
 proteinmpnn: { title: 'Robust deep learning based protein sequence design using ProteinMPNN', url: 'https://www.science.org/doi/10.1126/science.add2187', type: 'paper' },
 diffusion: { title: 'Denoising Diffusion Probabilistic Models', url: 'https://arxiv.org/abs/2006.11239', type: 'paper' },
 rfdiffusion: { title: 'De novo design of protein structure and function with RFdiffusion', url: 'https://www.nature.com/articles/s41586-023-06415-8', type: 'paper' },
 leakage: { title: 'Guiding questions to avoid data leakage in biological machine learning', url: 'https://www.nature.com/articles/s41592-024-02362-y', type: 'paper' },
 uniprot: { title: 'UniProt: Protein knowledgebase', url: 'https://www.uniprot.org/', type: 'documentation' },
}
const units: Unit[] = [
 { title:'Establish foundations', weeks:[4,6], checkpoint:'Explain protein chemistry and implement a sequence analysis and small learning model.', lessons:[
 lesson('bio','Atoms, amino acids and peptide bonds','Draw an amino acid and label backbone and side chain | Explain peptide bonds and N-to-C direction | Compare charged, polar and nonpolar residues','Annotated amino-acid diagram','protein','Fundamentals of protein composition'),
 lesson('bio','Protein structure and folding','Distinguish primary, secondary, tertiary and quaternary structure | Explain hydrogen bonding and hydrophobic effects | Sketch sequence-to-structure-to-function relationships','One-page structure map','protein','Principles of protein folding and architecture'),
 lesson('bio','Gene expression and cellular context','Trace DNA to RNA to protein | Explain how a mutation can change a protein | Describe protein localization and signaling at a high level','Annotated flow diagram','cell','Gene expression and proteins'),
 lesson('bio','Project: Protein sequence chemistry explorer','Classify residues using documented groups | Calculate composition for a short sequence | Explain why composition alone cannot establish folding or function','Composition plot and limitations','protein','Amino-acid side-chain chemistry'),
 lesson('comp','Python sequences and data structures','Review strings, lists, dictionaries and sets | Write sequence validation and residue counts | Check empty and invalid inputs','Working sequence summary functions','python','Data structures and defining functions'),
 lesson('comp','Project: FASTA sequence toolkit','Parse a small FASTA file by hand | Report lengths and residue frequencies | Save results as CSV and write usage instructions','FASTA toolkit and README','python','Reading files and data structures'),
 lesson('comp','NumPy arrays and geometry','Create arrays and inspect shapes and indexing | Calculate distances between a few coordinates | Compare loop and vectorized results','Distance notebook','numpy','Array creation, indexing and operations'),
 lesson('comp','Git and linear algebra foundations','Initialize a repository and make a commit | Calculate a dot product and matrix multiplication by hand | Reproduce both in NumPy','Versioned notebook with shapes','git','Getting Started and Git Basics'),
 lesson('ai','Prediction tasks and baselines','Define one input, label and prediction unit | Separate regression from classification | Propose a mean or majority-class baseline','One-page problem definition','sklearn','Cross-validation and model selection'),
 lesson('ai','Tokens, one-hot vectors and embeddings','Encode a short protein sequence as IDs and one-hot vectors | Explain embedding lookup and tensor shapes | State why IDs do not encode biological distances','Encoding notebook','torch','Tensors and building a neural network'),
 lesson('ai','Neural networks and gradients','Trace a linear layer and activation with dimensions | Compute a simple loss and derivative | Check gradient with PyTorch autograd','Worked forward and backward example','torch','Tensors, autograd and optimization'),
 lesson('ai','Project: Linear regression from scratch','Generate a tiny synthetic dataset | Implement predictions, MSE and gradient descent in NumPy | Plot loss and compare predictions against a mean baseline','Notebook and loss plot','numpy','Array operations'),
 ]},
 { title:'Understand interactions and measurements', weeks:[4,6], checkpoint:'Distinguish affinity, specificity and functional activity; interpret an assay and evaluate a simple model.', lessons:[
 lesson('bio','Antibody anatomy and recognition','Label heavy and light chains, VH/VL, CDRs, Fab and Fc | Define epitope and paratope | Compare IgG and VHH binders','Annotated antibody diagram','antibody','Antibody structure and binding'),
 lesson('bio','Binding affinity and kinetics','Define KD, association and dissociation rates | Compare affinity, avidity and specificity | State assumptions of a 1:1 binding model','Binding concepts glossary','binding','Molecular interactions and measurement'),
 lesson('bio','Targets, assays and function','Describe a target in its cellular context | Compare SPR/BLI binding measurements with a cellular functional assay | Identify positive and negative controls','Assay comparison and control plan','binding','Experimental methods for interactions'),
 lesson('bio','Developability and safety basics','Define stability, aggregation and solubility | Distinguish cross-reactivity from on-target toxicity | Explain why binding does not guarantee functional activity','Candidate evaluation checklist','protein','Protein dynamics and interactions'),
 lesson('comp','Probability and measurement noise','Explain distributions, means and variance | Simulate repeated noisy measurements | Compare sampling variability across sample sizes','Simulation plot','stats','Sampling and probability'),
 lesson('comp','Project: Binding curve and fitting','Implement theta = L/(KD + L) for free ligand | Plot multiple KD values | Fit synthetic noisy data and discuss assumptions','Binding-curve notebook','numpy','Array and plotting workflow'),
 lesson('comp','Derivatives and optimization','Calculate derivatives for simple loss functions | Explain the chain rule | Compare analytical and finite-difference gradients','Gradient-check exercise','math','Vector calculus and optimization'),
 lesson('comp','Project: Noisy-data fitting experiment','Simulate multiple datasets from a known curve | Fit a parameter for each dataset | Plot fitted parameter variation and discuss uncertainty','Simulation and uncertainty plot','stats','Estimation and uncertainty'),
 lesson('ai','Training, validation and test sets','Define training, validation and test roles | Explain overfitting and leakage | Sketch a defensible split for a biological dataset','Evaluation plan','sklearn','Cross-validation'),
 lesson('ai','Metrics and uncertainty','Calculate MAE and RMSE on a tiny example | Compare precision and recall for classification | Explain calibration and uncertainty qualitatively','Metric comparison notebook','sklearn','Model evaluation'),
 lesson('ai','Homology and leakage','Explain why closely related proteins across splits can inflate performance | Define desired deployment setting | List ways pretrained models can complicate leakage assessment','Leakage checklist','leakage','Full article and guiding questions'),
 lesson('ai','Project: Binding and measurement lab','Combine binding curve and noisy fitting notebooks | Annotate assumptions and controls | Document how an experimental binding measurement differs from a simulation','Portfolio-ready notebook','binding','Measurement methods'),
 ]},
 { title:'Learn sequence modeling', weeks:[6,8], checkpoint:'Explain attention and protein language models, and compare representations using a defensible baseline.', lessons:[
 lesson('bio','Evolution and sequence homology','Define homologs and conservation | Compare related sequence positions | Explain conserved and variable residues','Annotated alignment notes','protein','Sequence and structure'),
 lesson('bio','Mutations and sequence-function relationships','Distinguish substitution, insertion and deletion | Explain potential folding versus interface effects | Describe why effects depend on context','Mutation reasoning table','uniprot','Sequence annotations'),
 lesson('bio','Protein domains and families','Identify domains in a protein record | Explain domain versus complete chain | Compare sequences with shared domains','Annotated protein record','uniprot','Protein entries and annotations'),
 lesson('comp','Tensor shapes, batching and masks','Represent batches of unequal-length sequences | Implement padding and a mask | Explain tensor axes','Batching notebook','torch','Tensors and DataLoaders'),
 lesson('comp','Algorithms for sequence processing','Implement a frequency counter and a simple sequence comparison | Estimate time and space costs | Test edge cases','Sequence algorithms script','python','Data structures'),
 lesson('comp','Probability and softmax','Compute probabilities and conditional probabilities | Implement stable softmax | Interpret a categorical distribution','Softmax notebook','math','Probability and distributions'),
 lesson('ai','Project: Attention under a microscope','Construct tiny Q, K and V matrices | Compute scaled dot-product attention by hand and in NumPy | Plot weights and label dimensions','Attention notebook','attention','Section 3: Model architecture'),
 lesson('ai','Transformer components','Explain positional information, multi-head attention and feed-forward layers | Trace tensor shapes | Describe residual connections','Transformer diagram','attention','Sections 2–3'),
 lesson('ai','Protein language model pretraining','Explain masked-token prediction | Distinguish pretraining from downstream tasks | Describe embeddings and pooling','Model input-output and objective notes','esm','Model overview'),
 lesson('ai','Project: Protein-property baseline','Choose a small documented measured-property dataset | Train a mean baseline and simple sequence-feature model | Evaluate on held-out data and document split and limitations','Reproducible baseline report','sklearn','Model evaluation and preprocessing'),
 lesson('ai','Compare pretrained embeddings','Extract embeddings for a small dataset using a documented pretrained model | Fit the same simple predictor and compare with sequence features | Disclose pretraining and similarity caveats','Representation comparison notebook','bioai','Protein language models lectures'),
 ]},
 { title:'Learn structural modeling', weeks:[6,8], checkpoint:'Inspect a complex and explain coordinates, geometric symmetry, predictions and their limitations.', lessons:[
 lesson('bio','Experimental structure and data quality','Compare X-ray crystallography and cryo-EM conceptually | Identify resolution and missing residues | Explain experimental structure limitations','Structure-quality checklist','pdb','Experimental methods and missing coordinates'),
 lesson('bio','Protein complexes and interfaces','Identify chains and biological assembly | Examine a known antibody-antigen interface | Explain why proximity alone does not establish affinity','Annotated interface','pdb','Biological assemblies and coordinates'),
 lesson('bio','Dynamics and conformational change','Contrast bound and unbound structures conceptually | Explain conformational flexibility | List limitations of a static structure','Conformation notes','protein','Protein dynamics and interactions'),
 lesson('comp','Coordinates and symmetry','Implement translations and rotations on points | Verify preserved pairwise distances | Define invariance and equivariance','Rotation notebook','math','Linear transformations'),
 lesson('comp','Project: Protein geometry explorer','Load a small prepared coordinate table | Compute interchain distances and a contact map | Verify a rotation preserves the map','Contact-map notebook','pdb','Dealing with coordinates'),
 lesson('comp','Graph representations','Represent residues as nodes and contacts as edges | Create an adjacency matrix | Explain how a cutoff changes the graph','Small residue graph','numpy','Array indexing'),
 lesson('ai','Structure prediction overview','Describe inputs and outputs of AlphaFold | Identify confidence measures and their limits | Distinguish structural confidence from binding evidence','Model summary','alphafold','Overview and methods'),
 lesson('ai','Geometric models','Define invariant and equivariant predictions | Explain message passing at a conceptual level | Trace a small graph update','Geometric model sketch','bioai','Geometric deep learning lectures'),
 lesson('ai','Inverse folding and ProteinMPNN','Contrast sequence-to-structure and structure-to-sequence tasks | Identify inputs and outputs | Summarize what model scores cannot establish','Inverse-folding notes','proteinmpnn','Introduction and methods'),
 ]},
 { title:'Study generative protein design', weeks:[6,8], checkpoint:'Explain and implement a toy generative process and critically assess a protein-design workflow.', lessons:[
 lesson('bio','Design constraints and tradeoffs','Compare specificity, affinity, stability and expression | Explain aggregation and solubility | Identify tradeoffs in candidate selection','Candidate requirements checklist','protein','Protein interactions and stability'),
 lesson('bio','Experimental design-test cycle','Map expression, purification, binding assay and functional assay | Propose controls | Explain what each experiment establishes','Experimental validation plan','binding','Experimental methods'),
 lesson('comp','Sampling distributions','Sample Gaussian and categorical distributions | Compare empirical and theoretical summaries | Set and document a random seed','Sampling notebook','numpy','Random sampling'),
 lesson('comp','Project: Toy diffusion visualization','Add Gaussian noise at increasing levels to simple 2-D data | Plot distributions at several times | Explain this forward process and its limits','Forward-noising plots','diffusion','Forward process'),
 lesson('ai','Autoregressive sequence generation','Explain next-token factorization and conditioning | Sample a toy categorical sequence | Discuss validity and novelty','Toy generation script','attention','Decoder and autoregression'),
 lesson('ai','Diffusion fundamentals','Explain forward noising and reverse denoising | Identify model input, output and training objective | Compare a toy implementation with the paper','Diffusion walkthrough','diffusion','Sections 2–3'),
 lesson('ai','Protein generation and conditioning','Read RFdiffusion overview | Identify scaffold, target conditioning and candidate outputs | List assumptions and experimental verification','Design workflow diagram','rfdiffusion','Introduction and results'),
 lesson('ai','Ranking and evaluation of generated candidates','Define novelty, diversity and structural plausibility | Explain why predicted confidence is not measured affinity | Design a candidate-selection rationale','Evaluation checklist','rfdiffusion','Results and limitations'),
 ]},
 { title:'Focused research-style project', weeks:[8,12], checkpoint:'Produce reproducible analyses, compare baselines, and defend a narrow conclusion with limitations.', lessons:[
 lesson('bio','Choose and investigate a protein system','Pick one public protein family or target | Summarize biology and relevant experimental measurements | Record why the target matters','One-page biological rationale','uniprot','Protein entries'),
 lesson('bio','Define measurements and validation','Identify label provenance and units | Compare biological versus technical variation | Propose an experimental control','Measurement and control table','binding','Interaction measurement methods'),
 lesson('comp','Reproducible research setup','Create a repository and environment | Document data provenance, splits and random seeds | Write clear run instructions','Reproducible project skeleton','git','Git Basics'),
 lesson('comp','Project: Reproducible analysis pipeline','Implement data checks and a simple baseline | Save splits and metrics | Re-run the workflow from documented commands','Reproducible pipeline','python','Modules and files'),
 lesson('ai','Research question and evaluation plan','Define a narrow measurable question | Select a baseline and held-out evaluation | Document intended generalization and leakage risks','Written project protocol','leakage','Guiding questions'),
 lesson('ai','Reproduce and compare','Reproduce a manageable public baseline | Test one controlled change | Report metrics and representative errors','Comparison table and error analysis','sklearn','Model selection and evaluation'),
 lesson('ai','Communicate and propose validation','Summarize findings and caveats | Create a concise portfolio README and one figure | Propose a feasible next experiment without claiming validation','Portfolio project and validation plan','bioai','Protein modeling materials'),
 ]},
]
const tracks: Record<Key, {name:string; color:string}> = { bio:{name:'Biology',color:'emerald'}, comp:{name:'Computational foundations',color:'sky'}, ai:{name:'AI/application',color:'amber'} }
const marker = '[Protein guide v1]'

/** Add missing guide records only. Existing work is never updated or deleted. */
export function buildStudyGuide(current: Snapshot, ctx: Ctx): Change[] {
 const changes: Change[] = []
 const trackIds = {} as Record<Key,string>
 const newTracks = (Object.keys(tracks) as Key[]).flatMap((key) => {
   const found = current.tracks.find(t => !t.archived_at && t.name.toLowerCase() === tracks[key].name.toLowerCase())
   if (found) { trackIds[key] = found.id; return [] }
   const row = newTrack(ctx, { ...tracks[key], position: current.tracks.length + Object.keys(trackIds).length })
   trackIds[key] = row.id; return [row]
 })
 if (newTracks.length) changes.push(insert('tracks',newTracks))
 const stages = units.map((unit, index) => current.stages.find(s => !s.archived_at && s.title.toLowerCase() === unit.title.toLowerCase()) ?? newStage(ctx,{title:unit.title,position:current.stages.length+index,est_weeks_min:unit.weeks[0],est_weeks_max:unit.weeks[1],description:'Estimated duration is flexible. Study tracks can progress independently.'}))
 const newStages = stages.filter(s => !current.stages.some(x => x.id === s.id))
 if (newStages.length) changes.push(insert('stages',newStages))
 const checkpoints = units.flatMap((u,i) => current.checkpoints.some(c => c.stage_id === stages[i].id && c.title === u.checkpoint) ? [] : [newCheckpoint(ctx,{stage_id:stages[i].id,title:u.checkpoint})])
 if(checkpoints.length) changes.push(insert('checkpoints',checkpoints))
 const resources = Object.entries(refs).map(([key, ref]) => ({key, row: current.resources.find(r => !r.archived_at && r.url === ref.url) ?? newResource(ctx,{...ref,description:'Reference for the optional protein design study guide.',tags:['protein study guide']})}))
 const newResources = resources.map(x=>x.row).filter(r => !current.resources.some(x=>x.id===r.id))
 if(newResources.length) changes.push(insert('resources',newResources))
 const topics: ReturnType<typeof newTopic>[] = []; const sessions: ReturnType<typeof newSession>[] = []; const tasks: ReturnType<typeof newTask>[] = []; const links: ReturnType<typeof newSessionResource>[] = []
 units.forEach((unit, i) => unit.lessons.forEach((item,j) => {
   if(current.sessions.some(s => s.description.includes(marker) && s.title === item.title)) return
   const topic = current.topics.find(t => !t.archived_at && t.stage_id === stages[i].id && t.title === item.title) ?? newTopic(ctx,{title:item.title,stage_id:stages[i].id,track_ids:[trackIds[item.track]],position:j,description:'Study guide topic; edit or schedule at your own pace.'})
   if(!current.topics.some(t=>t.id===topic.id)) topics.push(topic)
   const session = newSession(ctx,{title:item.title,description:`${marker} Suggested session; split or extend as needed.`,track_id:trackIds[item.track],topic_id:topic.id,planned_min:120,output:item.output})
   sessions.push(session)
   item.tasks.forEach((title,position)=>tasks.push(newTask(ctx,{session_id:session.id,title,position})))
   const resource = resources.find(r=>r.key===item.resource)!.row
   links.push(newSessionResource(ctx,{session_id:session.id,resource_id:resource.id,portion_kind:'other',portion:item.portion}))
 }))
 if(topics.length) changes.push(insert('topics',topics))
 if(sessions.length) changes.push(insert('sessions',sessions))
 if(tasks.length) changes.push(insert('tasks',tasks))
 if(links.length) changes.push(insert('session_resources',links))
 return changes
}
